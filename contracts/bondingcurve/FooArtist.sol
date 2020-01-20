pragma solidity ^0.5.0;

import "./CommonsToken.sol";
import "./vendor/ERC20/Dummy.sol";
import "./vendor/ERC20/DummyNoPayable.sol";
import "./vendor/access/Ownable.sol";
import "./vendor/ERC20/WPHTPromotion.sol";
import "./vendor/ERC20/WPHT.sol";
import "./BarWPHTPromotion.sol";

contract FooArtist is CommonsToken, Ownable {
    string public name;   // e.g: Armin Van Lightstreams
    string public symbol; // e.g: AVL

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

    function approveBar(address payable addr, address guy, uint wad) public {
        BarWPHTPromotion bar = BarWPHTPromotion(addr);
        bar.approve(guy, wad);
    }
    
    function pullPromoTokens(address payable addr, uint wad) public {
        BarWPHTPromotion bar = BarWPHTPromotion(addr);
        bar.withdraw(wad);
    }
}
