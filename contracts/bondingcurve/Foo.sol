pragma solidity ^0.5.0;
import "./Bar.sol";
import "./BarWPHTPromotion.sol";

contract Foo {    

    function depositValue(address payable addr, uint value) public {
        Bar bar = Bar(addr);
        bar.depositValue(value);
    }

    function deposit(address payable addr) public payable {
        Bar bar = Bar(addr);
        bar.deposit();
    }

    function approve(address payable addr, address guy, uint wad) public {
        BarWPHTPromotion bar = BarWPHTPromotion(addr);
        bar.approve(guy, wad);
    }
}
