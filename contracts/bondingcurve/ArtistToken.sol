pragma solidity ^0.5.0;

import "./CommonsToken.sol";
import "./vendor/access/Ownable.sol";
import "./vendor/ERC20/WPHTPromotion.sol";

contract ArtistToken is CommonsToken, Ownable {
    string public name;   // e.g: Armin Van Lightstreams
    string public symbol; // e.g: AVL

    WPHTPromotion public promoToken;
    mapping (address => uint) public promoBalanceOf;
    mapping (address => bool) public promoClaimed;

    /*
    * @param _addresses [0] externalToken [1] fundingPool [2] feeRecipient [3] pauser
    * @param _settings [0] _gasPrice [1] _theta [2] _p0 [3] _initialRaise [4] _friction [5] _hatchDurationSeconds [6] _hatchVestingDurationSeconds [7] _minExternalContribution
    * @param _reserveRatio
    */
    constructor (
        string memory _name,
        string memory _symbol,
        address[4] memory _addresses,
        uint256[8] memory _settings,
        uint32 _reserveRatio
    ) public
    CommonsToken(
        _addresses,
        _settings,
        _reserveRatio
    )
    Ownable(msg.sender)
    {
        name = _name;
        symbol = _symbol;

        promoToken = WPHTPromotion(address(uint160(_addresses[0])));
    }

    function hatchContribute(uint256 value) public {
        super.hatchContribute(value);

        uint promoTokens = promoToken.pullPromotionTokens(msg.sender, value);
        promoBalanceOf[msg.sender] = promoTokens;

        uint256 paidExternal = initialContributions[msg.sender].paidExternal;
        uint256 lockedInternal = initialContributions[msg.sender].lockedInternal;

        initialContributions[msg.sender].paidExternal = paidExternal.sub(promoTokens);
        initialContributions[msg.sender].lockedInternal = lockedInternal.sub(super._calcInternalTokens(promoTokens));
    }
    
    function claimPromoTokens() public {
        uint promoBalance = promoBalanceOf[msg.sender];
        require(promoBalance > 0, "There are no pomotion tokens to claim.");

        require(!promoClaimed[msg.sender], "Promotion tokens have already been claimed.");
        promoClaimed[msg.sender] = true;
        uint256 internalTokens = super._calcInternalTokens(promoBalance);
        super._transfer(address(this), msg.sender, internalTokens);
    }
}
