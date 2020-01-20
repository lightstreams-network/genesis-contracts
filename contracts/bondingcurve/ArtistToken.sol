pragma solidity ^0.5.0;

import "./CommonsToken.sol";
import "./vendor/ERC20/Dummy.sol";
import "./vendor/ERC20/DummyNoPayable.sol";
import "./vendor/access/Ownable.sol";
import "./vendor/ERC20/WPHTPromotion.sol";
import "./vendor/ERC20/WPHT.sol";
import "./BarWPHTPromotion.sol";

contract ArtistToken is CommonsToken, Ownable {
    string public name;   // e.g: Armin Van Lightstreams
    string public symbol; // e.g: AVL

    //WPHTPromotion public promotionToken;
    mapping (address => uint) public promoBalanceOf;

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
    }

    function setPromotionToken(address payable _address) public {
        //promotionToken = WPHTPromotion(_address);
    }

    function approveBar(address payable addr, address guy, uint wad) public {
        WPHTPromotion bar = WPHTPromotion(addr);
        bar.approve(guy, wad);
    }

    function pullPromoTokens(address payable addr, uint value) public {
        WPHTPromotion promoContract = WPHTPromotion(addr);
        promoContract.pullPromotionTokens(msg.sender, value);
    }

    /*
    function pullPromotionTokens(address promoContractAddr, uint value) public {
        
        address payable wallet = address(uint160(promoContractAddr));

        WPHTPromotion promoContract = WPHTPromotion(wallet);
        promoContract.pullPromotionTokens(msg.sender, value);
    }
    */

    /*
    function pullPromotionTokens(address payable promoContractAddr, uint value) public {
        WPHTPromotion promoContract = WPHTPromotion(promoContractAddr);
        promoContract.pullPromotionTokens(msg.sender, value);
    }*/

    /*
    function addPromotionSpending(address payable addr, address account) public {
        WPHTPromotion d = WPHTPromotion(addr);
        d.addPromotionSpending(account);
    }*/

    /*
    function approve(address payable addr, address account, uint value) public {
        Dummy d = Dummy(addr);
        d.approve(account, value);
    }*/

    /*
    function approve(address addr, address account, uint value) public {
        DummyNoPayable d = DummyNoPayable(addr);
        d.approve(account, value);
    }*/

    /*
    function approve(address payable addr, address guy, uint wad) public {
        BarWPHTPromotion bar = BarWPHTPromotion(addr);
        bar.approve(guy, wad);
    }*/

    /*
    function getDummyBalance(address payable addr) public returns (uint) {
        WPHTPromotion d = WPHTPromotion(addr);
        return d.balanceOf(msg.sender);
    }*/

    /*
    function pullPromotionTokens(address payable addr, uint value) public {
        WPHTPromotion d = WPHTPromotion(addr);
        d.pullPromotionTokens(msg.sender, value);
        //uint promoTokens = d.pullPromotionTokens(msg.sender, value);
        //promoBalanceOf[msg.sender] = promoTokens;
    }*/

    /*
    function getBalance(address payable addr) public returns (uint) {
        WPHT d = WPHT(addr);
        return d.balanceOf(msg.sender);
    }*/
}
