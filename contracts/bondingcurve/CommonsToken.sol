pragma solidity ^0.5.0;

import "./BondingCurveToken.sol";

/**
 * @title CommonsToken
 * @author Rinke Hendriksen (@eknir) and Pavle Batuta (@flooffieban), during the Oddyssey hackathon in Groningen '19 (part of team: Giveth - Crowdfunding the commons)
 * @notice This smart contract implements the augmented bonding curve design principle (described here: https://medium.com/@abbey_titcomb/3f1f7c1fa751
 * @dev We use the BancorFormule to define the slope of the curve, an ERC20 to model the internal token (minted by the bonding curve) and an ERC20 to model the external (stable currency) token
 * @dev Source: https://github.com/commons-stack/genesis-contracts/tree/master/contracts/bondingcurve
 */
contract CommonsToken is BondingCurveToken {

  /**PreHatchContribution keeps track of the contribution of a hatcher during the hatchin phase:
      paidExternal: the amount contributed during the hatching phase, denominated in external currency
      lockedInternal: paidExternal / p0 = the amount of internal tokens represented by paidExternal.
        These tokens are unlocked post-hatch according to a vesting policy. Post hatch, we decrease lockedInternal to 0
  */
  struct PreHatchContribution {
    uint256 paidExternal;
    uint256 lockedInternal;
  }

  // --- CONSTANTS: ---

  // Helper to represent fractions => 100% = 1000000, 1% = 10000
  uint256 constant DENOMINATOR_PPM = 1000000;

  // --- STORAGE: ---

  // External token contract (Stablecurrency e.g. DAI).
  ERC20 public externalToken;

  // Address of the funding pool contract.
  address public fundingPool;

  // Address of the account who will collect all fees from burning tokens.
  address public feeRecipient;

  // Curve parameters:
  uint256 public theta; // fraction (in PPM) of the contributed amount that goes to the funding pool
  uint256 public p0; // price (in externalToken) for which people can purchase the internal token during the hathing phase
  uint256 public initialRaise; // the amount of external tokens that must be contributed during the hatching phase to go post-hatching
  uint256 public friction; // the fraction (in PPM) that goes to the funding pool when internal tokens are burned

  // Minimal EXTERNAL token contribution:
  uint256 public minExternalContribution;

  // Total amount of EXTERNAL tokens raised:
  uint256 public raisedExternal;

  // Total amount of INTERNAL tokens which (can + are) unlocked.
  uint256 private unlockedInternal;

  // Curve state (has it been hatched?).
  bool public isHatched;

  // Timestamp by which the curve must be hatched since initialization.
  uint256 public hatchDeadline;

  // Timestamp by which any hatcher won't be able to claim any tokens.
  uint256 public hatchVestingDeadline;

  // Time (in seconds) defining how long after hatching finishes a hatcher won't be able to claim any tokens.
  uint256 public hatchVestingDurationSeconds;

  // Mapping of hatchers to contributions.
  mapping(address => PreHatchContribution) public initialContributions;

  // --- MODIFIERS: ---

  modifier whileHatched(bool _hatched) {
    require(isHatched == _hatched, "Curve must be hatched");
    _;
  }

  modifier onlyFundingPool() {
    require(msg.sender == fundingPool, "Must be called by the funding pool");
    _;
  }

  modifier onlyHatcher() {
    require(initialContributions[msg.sender].paidExternal != 0, "Must be called by a hatcher");
    _;
  }

  modifier mustBeInPPM(uint256 _val) {
    require(_val <= DENOMINATOR_PPM, "Value must be in PPM");
    _;
  }

  modifier mustBeNonZeroAdr(address _adr) {
    require(_adr != address(0), "Address must not be zero");
    _;
  }

  modifier mustBeLargeEnoughContribution(uint256 _amountExternal) {
    uint256 totalAmountExternal = initialContributions[msg.sender].paidExternal + _amountExternal;
    require(totalAmountExternal >= minExternalContribution, "Insufficient contribution");
    _;
  }

  modifier expiredStatus(bool _wantExpire) {
    bool expired = now <= hatchDeadline;
    if (_wantExpire) {
      require(!expired, "Curve hatch time has expired");
    }
    require(expired, "Curve hatch time has expired");
    _;
  }

  modifier vestingFinished() {
    require(now >= hatchVestingDeadline, "unable to claim any tokens because vesting is not over yet");
    _;
  }

  /*
  * @notice initializes the contract
  *
  * @param _addresses [0] externalToken [1] fundingPool [2] feeRecipient
  * @param _reserveRatio (in PPM) which get's used in the BancorFormula contract as the connectorWeight
  * @param _gasPrice we need to set this such that everybody pays an equal amount of gas and we protect against front-running the bonding curve
  * @param _theta (in PPM) which is the percentage of worth in internal tokens of the contribution in externalTokens that get's minted to the funding pool once the hatch phase ends
  * @param _p0 the price denominated in external token of one internal token (i.e. if P0 is 10 => if you contribute 100 external tokens you get 10 internal tokens DURING the hatch phase)
  * @param _initialRaise which is the amount of external tokens that must be contributed during the hatching phase to go post-hatching phase
  * @param _friction the fraction (in PPM) that goes to the funding pool when internal tokens are burned (post-hatch)
  * @param _hatchDurationSeconds time (in seconds) by which the curve must be hatched since calling this constructor.
  * @param _hatchVestingDurationSeconds time (in seconds) defining how long after hatching finishes a hatcher won't be able to claim any tokens.
  * @param _minExternalContribution the minimum amount of external tokens that should be contributed by a hatcher
  */
  constructor(
    address[3] memory _addresses,
    uint32 _reserveRatio,
    uint256 _gasPrice,
    uint256 _theta,
    uint256 _p0,
    uint256 _initialRaise,
    uint256 _friction,
    uint256 _hatchDurationSeconds,
    uint256 _hatchVestingDurationSeconds,
    uint256 _minExternalContribution
  )
    public
    mustBeNonZeroAdr(_addresses[0])
    mustBeNonZeroAdr(_addresses[1])
    mustBeNonZeroAdr(_addresses[2])
    mustBeInPPM(_reserveRatio)
    mustBeInPPM(_theta)
    mustBeInPPM(_friction)
    BondingCurveToken(_reserveRatio, _gasPrice)
  {
    theta = _theta;
    p0 = _p0;
    initialRaise = _initialRaise;
    fundingPool = _addresses[1];
    feeRecipient = _addresses[2];
    friction = _friction;

    hatchDeadline = now + _hatchDurationSeconds;
    // Default value. Vesting deadline is set when hatching ends.
    hatchVestingDeadline = 0;
    hatchVestingDurationSeconds = _hatchVestingDurationSeconds;

    minExternalContribution = _minExternalContribution;

    externalToken = ERC20(_addresses[0]);
  }

  function mint(uint256 _amount)
    public
    whileHatched(true)
  {
    _curvedMint(_amount);
  }

  function burn(uint256 _amount)
    public
    whileHatched(true)
    returns (uint256)
  {
    return _curvedBurn(_amount);
  }

  function hatchContribute(uint256 _value)
    public
    mustBeLargeEnoughContribution(_value)
    whileHatched(false)
    expiredStatus(false)
  {
    uint256 contributed = _value;

    if(raisedExternal + contributed < initialRaise) {
      raisedExternal += contributed;
      _pullExternalTokens(contributed);
    } else {
      contributed = initialRaise - raisedExternal;
      raisedExternal = initialRaise;
      _pullExternalTokens(contributed);
      _endHatchPhase();
    }

    // Increase the amount paid in EXTERNAL tokens.
    initialContributions[msg.sender].paidExternal += contributed;

    // Lock the INTERNAL tokens, total is EXTERNAL amount * price of internal token during the raise.
    initialContributions[msg.sender].lockedInternal += contributed * p0;
  }

  function fundsAllocated(uint256 _externalAllocated)
    public
    onlyFundingPool
    whileHatched(true)
  {
    // Currently, we unlock a 1/1 proportion of tokens.
    // We could set a different proportion:
    //  100.000 funds spend => 50.000 worth of funds unlocked.
    // We should only update the total unlocked when it is less than 100%.

    // TODO: add vesting period ended flag and optimise check.
    unlockedInternal += _externalAllocated / p0;
    if (unlockedInternal >= initialRaise * p0) {
      unlockedInternal = initialRaise * p0;
    }
  }

  function claimTokens()
    public
    whileHatched(true)
    onlyHatcher
    vestingFinished
  {
    require(initialContributions[msg.sender].lockedInternal > 0);

    uint256 paidExternal = initialContributions[msg.sender].paidExternal;
    uint256 lockedInternal = initialContributions[msg.sender].lockedInternal;

    // The total amount of INTERNAL tokens that should have been unlocked.
    uint256 shouldHaveUnlockedInternal = (paidExternal * unlockedInternal) / initialRaise;
    // The amount of INTERNAL tokens that was already unlocked.
    uint256 previouslyUnlockedInternal = (paidExternal / p0) - lockedInternal;
    // The amount that can be unlocked.
    uint256 toUnlock = shouldHaveUnlockedInternal - previouslyUnlockedInternal;

    initialContributions[msg.sender].lockedInternal -= toUnlock;
    _transfer(address(this), msg.sender, toUnlock);
  }

  function refund()
    public
    whileHatched(false)
    expiredStatus(true)
  {
    // Refund the EXTERNAL tokens from the contibution.
    uint256 paidExternal = initialContributions[msg.sender].paidExternal;
    externalToken.transfer(msg.sender, paidExternal);
  }

  function poolBalance()
    public
    view
    returns(uint256)
  {
    return externalToken.balanceOf(address(this));
  }

  // Try and pull the given amount of reserve token into the contract balance.
  // Reverts if there is no approval.
  function _pullExternalTokens(uint256 _amount)
    internal
  {
    externalToken.transferFrom(msg.sender, address(this), _amount);
  }

  // End the hatching phase of the curve.
  // Allow the fundingPool to pull theta times the balance into their control.
  // NOTE: 1 - theta is reserve.
  function _endHatchPhase()
    internal
  {
    uint256 amountFundingPoolExternal = ((initialRaise) * theta ) / DENOMINATOR_PPM; // denominated in external
    // FIXES: https://github.com/commons-stack/genesis-contracts/issues/16
    // uint256 amountReserveInternal = (initialRaise / p0) * (DENOMINATOR_PPM - theta) / DENOMINATOR_PPM; // denominated in internal

    // _transfer(address(this), fundingPool, amount);

    // transfer external tokens to the funding pool:
    externalToken.transfer(fundingPool, amountFundingPoolExternal);

    // Mint INTERNAL tokens to the reserve:
    // FIXES: https://github.com/commons-stack/genesis-contracts/issues/16
    // _mint(address(this), amountReserveInternal);
    _mint(address(this), initialRaise * p0);

    // End the hatching phase
    isHatched = true;
    // Start hatchers vesting
    hatchVestingDeadline = now + hatchVestingDurationSeconds;
  }

  /**
   * @dev Mint tokens
   *
   * @param amount Amount of tokens to deposit
   */
  function _curvedMint(uint256 amount) internal returns (uint256) {
    require(externalToken.transferFrom(msg.sender, address(this), amount));
    super._curvedMint(amount);
  }

  /**
   * @dev Burn tokens
   *
   * @param amount Amount of tokens to burn
   */
  function _curvedBurn(uint256 amount) internal returns (uint256) {
    uint256 reimbursement = super._curvedBurn(amount);
    uint256 frictionCost = friction * reimbursement / DENOMINATOR_PPM;
    externalToken.transfer(msg.sender, reimbursement - frictionCost);
    externalToken.transfer(feeRecipient, frictionCost);

    if (feeRecipient != fundingPool) {
      unlockedInternal += frictionCost / p0;
    }

    return reimbursement;
  }
}
