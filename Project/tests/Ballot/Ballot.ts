import { expect } from "chai";
import { ethers } from "hardhat";
// eslint-disable-next-line node/no-missing-import
import { Ballot } from "../../typechain";

const PROPOSALS = ["Proposal 1", "Proposal 2", "Proposal 3"];

function convertStringArrayToBytes32(array: string[]) {
  const bytes32Array = [];
  for (let index = 0; index < array.length; index++) {
    bytes32Array.push(ethers.utils.formatBytes32String(array[index]));
  }
  return bytes32Array;
}

async function giveRightToVote(ballotContract: Ballot, voterAddress: any) {
  const tx = await ballotContract.giveRightToVote(voterAddress);
  await tx.wait();
}

describe("Ballot", function () {
  let ballotContract: Ballot;
  let accounts: any[];

  beforeEach(async function () {
    accounts = await ethers.getSigners();
    const ballotFactory = await ethers.getContractFactory("Ballot");
    ballotContract = await ballotFactory.deploy(
      convertStringArrayToBytes32(PROPOSALS)
    );
    await ballotContract.deployed();
  });

  describe("when the contract is deployed", function () {
    it("has the provided proposals", async function () {
      for (let index = 0; index < PROPOSALS.length; index++) {
        const proposal = await ballotContract.proposals(index);
        expect(ethers.utils.parseBytes32String(proposal.name)).to.eq(
          PROPOSALS[index]
        );
      }
    });

    it("has zero votes for all proposals", async function () {
      for (let index = 0; index < PROPOSALS.length; index++) {
        const proposal = await ballotContract.proposals(index);
        expect(proposal.voteCount.toNumber()).to.eq(0);
      }
    });

    it("sets the deployer address as chairperson", async function () {
      const chairperson = await ballotContract.chairperson();
      expect(chairperson).to.eq(accounts[0].address);
    });

    it("sets the voting weight for the chairperson as 1", async function () {
      const chairpersonVoter = await ballotContract.voters(accounts[0].address);
      expect(chairpersonVoter.weight.toNumber()).to.eq(1);
    });
  });

  describe("when the chairperson interacts with the giveRightToVote function in the contract", function () {
    it("gives right to vote for another address", async function () {
      const voterAddress = accounts[1].address;
      const tx = await ballotContract.giveRightToVote(voterAddress);
      await tx.wait();
      const voter = await ballotContract.voters(voterAddress);
      expect(voter.weight.toNumber()).to.eq(1);
    });

    it("can not give right to vote for someone that has voted", async function () {
      const voterAddress = accounts[1].address;
      await giveRightToVote(ballotContract, voterAddress);
      await ballotContract.connect(accounts[1]).vote(0);
      await expect(
        giveRightToVote(ballotContract, voterAddress)
      ).to.be.revertedWith("The voter already voted.");
    });

    it("can not give right to vote for someone that already has voting rights", async function () {
      const voterAddress = accounts[1].address;
      await giveRightToVote(ballotContract, voterAddress);
      await expect(
        giveRightToVote(ballotContract, voterAddress)
      ).to.be.revertedWith("");
    });
  });

  describe("when the voter interact with the vote function in the contract", function () {
    it("successfully vote", async function () {
      const voteCountBefore = (await ballotContract.proposals(1)).voteCount;
      await ballotContract.connect(accounts[0]).vote(1);
      const voteCountAfter = (await ballotContract.proposals(1)).voteCount;
      const voter = await ballotContract.voters(accounts[0].address);

      expect(voteCountAfter.toNumber() - voteCountBefore.toNumber()).to.eq(
        voter.weight.toNumber()
      );
      expect(voter.voted).to.equal(true);
      expect(voter.vote.toNumber()).to.equal(1);
    });
  });

  describe("when the voter interact with the delegate function in the contract", function () {
    it("Successfully delegate to a voter who has not voted", async function () {
      await ballotContract
        .connect(accounts[0])
        .giveRightToVote(accounts[1].address);

      const voterWeightBefore = (
        await ballotContract.voters(accounts[1].address)
      ).weight;

      await ballotContract.connect(accounts[0]).delegate(accounts[1].address);

      const voterWeightAfter = (
        await ballotContract.voters(accounts[1].address)
      ).weight;

      expect(voterWeightAfter.toNumber()).to.gt(voterWeightBefore.toNumber());
    });

    it("Successfully delegate to a voter who has voted", async function () {
      await ballotContract
        .connect(accounts[0])
        .giveRightToVote(accounts[1].address);

      await ballotContract.connect(accounts[1]).vote(1);

      const voterCounttBefore = (await ballotContract.proposals(1)).voteCount;

      await ballotContract.connect(accounts[0]).delegate(accounts[1].address);

      const voterCounttAfter = (await ballotContract.proposals(1)).voteCount;

      expect(voterCounttAfter.toNumber()).to.gt(voterCounttBefore.toNumber());
    });
  });

  describe("when the an attacker interact with the giveRightToVote function in the contract", function () {
    it("cannot give right to vote ", async function () {
      await expect(
        ballotContract.connect(accounts[1]).giveRightToVote(accounts[2].address)
      ).to.be.revertedWith("Only chairperson can give right to vote.");
    });
  });

  describe("when the an attacker interact with the vote function in the contract", function () {
    it("cannot vote with zero weight", async function () {
      await expect(
        ballotContract.connect(accounts[1]).vote(1)
      ).to.be.revertedWith("Has no right to vote");
    });

    it("cannot vote twice", async function () {
      await ballotContract.connect(accounts[0]).vote(1);
      await expect(
        ballotContract.connect(accounts[0]).vote(1)
      ).to.be.revertedWith("Already voted.");
    });
  });

  describe("when the an attacker interact with the delegate function in the contract", function () {
    it("cannot delegate after voting", async function () {
      await ballotContract.connect(accounts[0]).vote(1);
      await expect(
        ballotContract.connect(accounts[0]).delegate(accounts[1].address)
      ).to.be.revertedWith("You already voted.");
    });

    it("cannot delegate to self", async function () {
      await expect(
        ballotContract.connect(accounts[0]).delegate(accounts[0].address)
      ).to.be.revertedWith("Self-delegation is disallowed.");
    });

    it("cannot participate in loop delegation", async function () {
      await ballotContract
        .connect(accounts[0])
        .giveRightToVote(accounts[1].address);

      await ballotContract
        .connect(accounts[0])
        .giveRightToVote(accounts[2].address);

      await ballotContract.connect(accounts[0]).delegate(accounts[1].address);

      await ballotContract.connect(accounts[1]).delegate(accounts[2].address);

      await expect(
        ballotContract.connect(accounts[2]).delegate(accounts[0].address)
      ).to.be.revertedWith("Found loop in delegation.");
    });

    it("cannot delegate to wallet that cannot vote", async function () {
      await expect(
        ballotContract.connect(accounts[0]).delegate(accounts[1].address)
      ).to.be.revertedWith("");
    });
  });

  describe("when someone interact with the winningProposal function before any votes are cast", function () {
    it("before any votes are cast", async function () {
      await ballotContract.winningProposal();
      const proposal1 = await ballotContract.proposals(0);
      const proposal2 = await ballotContract.proposals(1);
      const proposal3 = await ballotContract.proposals(2);
      expect(proposal1.voteCount.toNumber()).to.equal(0);
      expect(proposal2.voteCount.toNumber()).to.equal(0);
      expect(proposal3.voteCount.toNumber()).to.equal(0);
    });
  });

  describe("when someone interact with the winningProposal function after one vote is cast for the first proposal", function () {
    it("after one vote is cast for the first proposal", async function () {
      await ballotContract.connect(accounts[0]).vote(0);
      expect((await ballotContract.winningProposal()).toNumber()).to.equal(0);
    });
  });
});
