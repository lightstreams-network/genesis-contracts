pragma solidity ^0.5.0;

import "../math/SafeMath.sol";
import "./Dummy.sol";

contract WPHTPromotion is Dummy {
    using SafeMath for uint;
    
    // addresses that promotion tokens can be transferred to.
    mapping (address => bool) private promotionAccounts;

    // recipient of promotion tokens -> balance
    mapping (address => uint) public promoBalanceOf;

    mapping (address => mapping (address => uint)) private transferred;

    mapping (address => mapping (address => uint)) private approved;

    function addPromotionSpending(address account) public {
        promotionAccounts[account] = true;
    }

    function removePromotionSpending(address account) public {
        promotionAccounts[account] = false;
    }

    function transferAsPromotion(address recipient, uint value) public returns (bool) {
        promoBalanceOf[recipient] = value;
        return super.transfer(recipient, value);
    }

    function approvePromotionTokens(address spender, uint value) public returns (bool) {
        approved[msg.sender][spender] = value;
        return super.approve(spender, value);
    }

    function pullPromotionTokens(address from, uint value) public returns (uint) {
        uint tokens = transferred[from][msg.sender];
        if (tokens == 0) {
            return 0;
        }

        if (tokens < value) {
            transferred[from][msg.sender] = 0;
            return tokens;
        }

        transferred[from][msg.sender] = transferred[from][msg.sender].sub(value);
        promoBalanceOf[msg.sender] = promoBalanceOf[msg.sender].add(value);
        return value;
    }
    
    function transferFrom(address from, address to, uint value) public returns (bool) {
        if (from != msg.sender && approved[from][msg.sender] > 0) {
            require(promotionAccounts[to], "Promotion tokens can only be sent to a valid promotion account.");

            approved[from][msg.sender].sub(value);

            promoBalanceOf[from] = promoBalanceOf[from].sub(value);
            transferred[from][to] = transferred[from][to].add(value);

            return super.transferFrom(from, to, value);
        }

        uint balance = this.balanceOf(from);
        uint nonPromotional = balance - promoBalanceOf[from];
        require(nonPromotional >= value, "There is an insufficient balance of non-promotional tokens.");

        return super.transferFrom(from, to, value);
    }
}
