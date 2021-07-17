pragma solidity >=0.7.0 <0.8.0;

interface AggregatorV3Interface1 {

    function decimals()
        external
        view
    returns (
        uint8
    );

  function latestRoundData()
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );
}

contract chainlink {
    function getLatestPrice(address _oracle) public view returns (int, uint8) {
    (
        uint80 roundID,
        int price,
        uint startedAt,
        uint timeStamp,
        uint80 answeredInRound
    ) = AggregatorV3Interface1(_oracle).latestRoundData();
        uint8 decimals = AggregatorV3Interface1(_oracle).decimals();
        return (price, decimals);
    }
}