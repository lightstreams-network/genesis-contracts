pragma solidity ^0.5.0;

contract Bar {    
    mapping (address => uint) public  balanceOf;

    function() external payable {
        deposit();
    }

    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
    }

    function depositValue(uint value) public payable {
        balanceOf[msg.sender] += value;
    }
}
