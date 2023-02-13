import { Bytes, log } from "@graphprotocol/graph-ts";

import {
  AddToBalanceEvent,
  DistributeToPayoutModEvent,
  DistributeToTicketModEvent,
  MintTokensEvent,
  Participant,
  PayEvent,
  PrintReservesEvent,
  Project,
  ProtocolV1Log,
  RedeemEvent,
  TapEvent,
} from "../../../generated/schema";
import {
  AddToBalance,
  DistributeToPayoutMod,
  DistributeToTicketMod,
  Pay,
  PrintReserveTickets,
  PrintTickets,
  Redeem,
  Tap,
} from "../../../generated/TerminalV1_1/TerminalV1_1";
import { PROTOCOL_ID } from "../../constants";
import { address_v1_terminalV1_1 } from "../../contractAddresses";
import { ProjectEventKey, PV } from "../../enums";
import { newParticipant } from "../../utils/entities/participant";
import { saveNewProjectTerminalEvent } from "../../utils/entities/projectEvent";
import {
  newProtocolV1Log,
  updateProtocolEntity,
} from "../../utils/entities/protocolLog";
import {
  idForParticipant,
  idForPayEvent,
  idForProject,
  idForProjectTx,
} from "../../utils/ids";
import { v1USDPriceForEth } from "../../utils/prices";
import { handleTrendingPayment } from "../../utils/trending";

const terminal: Bytes = Bytes.fromHexString(address_v1_terminalV1_1!);

const pv = PV.PV1;

export function handlePay(event: Pay): void {
  const pay = new PayEvent(idForPayEvent());
  const projectId = idForProject(event.params.projectId, pv);
  const project = Project.load(projectId);

  // Safety check: fail if project doesn't exist
  if (!project) {
    log.error("[handlePay] Missing project. ID:{}", [projectId]);
    return;
  }

  const amountUSD = v1USDPriceForEth(event.params.amount);
  project.totalPaid = project.totalPaid.plus(event.params.amount);
  if (amountUSD) project.totalPaidUSD = project.totalPaidUSD.plus(amountUSD);
  project.currentBalance = project.currentBalance.plus(event.params.amount);
  project.paymentsCount = project.paymentsCount + 1;
  project.save();

  if (pay) {
    pay.pv = pv.toString();
    pay.terminal = terminal;
    pay.projectId = event.params.projectId.toI32();
    pay.amount = event.params.amount;
    pay.amountUSD = amountUSD;
    pay.beneficiary = event.params.beneficiary;
    pay.caller = event.transaction.from;
    pay.project = projectId;
    pay.note = event.params.note;
    pay.timestamp = event.block.timestamp.toI32();
    pay.txHash = event.transaction.hash;
    pay.save();

    saveNewProjectTerminalEvent(
      event,
      event.params.projectId,
      pay.id,
      pv,
      ProjectEventKey.payEvent,
      terminal
    );

    handleTrendingPayment(event.block.timestamp);
  }

  let protocolV1Log = ProtocolV1Log.load(PROTOCOL_ID);
  if (!protocolV1Log) protocolV1Log = newProtocolV1Log();
  if (protocolV1Log) {
    protocolV1Log.volumePaid = protocolV1Log.volumePaid.plus(
      event.params.amount
    );
    if (amountUSD) {
      protocolV1Log.volumePaidUSD = protocolV1Log.volumePaidUSD.plus(amountUSD);
    }
    protocolV1Log.paymentsCount = protocolV1Log.paymentsCount + 1;
    protocolV1Log.save();
  }
  updateProtocolEntity();

  const participantId = idForParticipant(
    event.params.projectId,
    pv,
    event.params.beneficiary
  );
  let participant = Participant.load(participantId);
  if (!participant) {
    participant = newParticipant(
      pv,
      event.params.projectId,
      event.params.beneficiary
    );
  } else {
    participant.totalPaid = participant.totalPaid.plus(event.params.amount);
    if (amountUSD) {
      participant.totalPaidUSD = participant.totalPaidUSD.plus(amountUSD);
    }
  }
  participant.lastPaidTimestamp = event.block.timestamp.toI32();
  participant.save();
}

export function handlePrintTickets(event: PrintTickets): void {
  /**
   * Note: Receiver balance is updated in the ticketBooth event handler.
   *
   * TBH the only reason to do this logic here instead of ticketBooth
   * is to make use of the `memo` field
   */

  const mintTokensEvent = new MintTokensEvent(
    idForProjectTx(event.params.projectId, pv, event, true)
  );
  const projectId = idForProject(event.params.projectId, pv);

  if (!mintTokensEvent) return;

  mintTokensEvent.pv = pv.toString();
  mintTokensEvent.projectId = event.params.projectId.toI32();
  mintTokensEvent.amount = event.params.amount;
  mintTokensEvent.beneficiary = event.params.beneficiary;
  mintTokensEvent.caller = event.transaction.from;
  mintTokensEvent.memo = event.params.memo;
  mintTokensEvent.project = projectId;
  mintTokensEvent.timestamp = event.block.timestamp.toI32();
  mintTokensEvent.txHash = event.transaction.hash;
  mintTokensEvent.save();

  saveNewProjectTerminalEvent(
    event,
    event.params.projectId,
    mintTokensEvent.id,
    pv,
    ProjectEventKey.mintTokensEvent,
    terminal
  );
}

export function handleTap(event: Tap): void {
  const projectId = idForProject(event.params.projectId, pv);
  const tapEvent = new TapEvent(
    idForProjectTx(event.params.projectId, pv, event)
  );

  if (tapEvent) {
    tapEvent.amount = event.params.amount;
    tapEvent.amountUSD = v1USDPriceForEth(event.params.amount);
    tapEvent.beneficiary = event.params.beneficiary;
    tapEvent.beneficiaryTransferAmount = event.params.beneficiaryTransferAmount;
    tapEvent.caller = event.transaction.from;
    tapEvent.currency = event.params.currency;
    tapEvent.fundingCycleId = event.params.fundingCycleId;
    tapEvent.govFeeAmount = event.params.govFeeAmount;
    tapEvent.govFeeAmountUSD = v1USDPriceForEth(event.params.govFeeAmount);
    tapEvent.netTransferAmount = event.params.netTransferAmount;
    tapEvent.netTransferAmountUSD = v1USDPriceForEth(
      event.params.netTransferAmount
    );
    tapEvent.project = projectId;
    tapEvent.projectId = event.params.projectId.toI32();
    tapEvent.timestamp = event.block.timestamp.toI32();
    tapEvent.txHash = event.transaction.hash;
    tapEvent.save();

    saveNewProjectTerminalEvent(
      event,
      event.params.projectId,
      tapEvent.id,
      pv,
      ProjectEventKey.tapEvent,
      terminal
    );
  }

  const project = Project.load(projectId);
  if (project) {
    project.currentBalance = project.currentBalance
      .minus(event.params.govFeeAmount)
      .minus(event.params.netTransferAmount);
    project.save();
  }
}

export function handleRedeem(event: Redeem): void {
  const projectId = idForProject(event.params._projectId, pv);

  const returnAmountUSD = v1USDPriceForEth(event.params.returnAmount);

  const redeemEvent = new RedeemEvent(
    idForProjectTx(event.params._projectId, pv, event, true)
  );
  if (redeemEvent) {
    redeemEvent.projectId = event.params._projectId.toI32();
    redeemEvent.pv = pv.toString();
    redeemEvent.terminal = terminal;
    redeemEvent.amount = event.params.amount;
    redeemEvent.beneficiary = event.params.beneficiary;
    redeemEvent.caller = event.transaction.from;
    redeemEvent.holder = event.params.holder;
    redeemEvent.returnAmount = event.params.returnAmount;
    redeemEvent.returnAmountUSD = returnAmountUSD;
    redeemEvent.project = projectId;
    redeemEvent.timestamp = event.block.timestamp.toI32();
    redeemEvent.txHash = event.transaction.hash;
    redeemEvent.save();

    saveNewProjectTerminalEvent(
      event,
      event.params._projectId,
      redeemEvent.id,
      pv,
      ProjectEventKey.redeemEvent,
      terminal
    );
  }

  let protocolV1Log = ProtocolV1Log.load(PROTOCOL_ID);
  if (!protocolV1Log) protocolV1Log = newProtocolV1Log();
  if (protocolV1Log) {
    protocolV1Log.volumeRedeemed = protocolV1Log.volumeRedeemed.plus(
      event.params.returnAmount
    );
    if (returnAmountUSD) {
      protocolV1Log.volumeRedeemedUSD = protocolV1Log.volumeRedeemedUSD.plus(
        returnAmountUSD
      );
    }
    protocolV1Log.redeemCount = protocolV1Log.redeemCount + 1;
    protocolV1Log.save();
  }
  updateProtocolEntity();

  const project = Project.load(projectId);
  if (project) {
    project.totalRedeemed = project.totalRedeemed.plus(
      event.params.returnAmount
    );
    if (returnAmountUSD) {
      project.totalRedeemedUSD = project.totalRedeemedUSD.plus(returnAmountUSD);
    }
    project.currentBalance = project.currentBalance.minus(
      event.params.returnAmount
    );
    project.redeemCount = project.redeemCount + 1;
    project.save();
  }
}

export function handlePrintReserveTickets(event: PrintReserveTickets): void {
  const projectId = idForProject(event.params.projectId, pv);
  const printReserveEvent = new PrintReservesEvent(
    idForProjectTx(event.params.projectId, pv, event)
  );
  if (!printReserveEvent) return;
  printReserveEvent.projectId = event.params.projectId.toI32();
  printReserveEvent.beneficiary = event.params.beneficiary;
  printReserveEvent.beneficiaryTicketAmount =
    event.params.beneficiaryTicketAmount;
  printReserveEvent.caller = event.transaction.from;
  printReserveEvent.count = event.params.count;
  printReserveEvent.fundingCycleId = event.params.fundingCycleId;
  printReserveEvent.project = projectId;
  printReserveEvent.timestamp = event.block.timestamp.toI32();
  printReserveEvent.txHash = event.transaction.hash;
  printReserveEvent.save();

  saveNewProjectTerminalEvent(
    event,
    event.params.projectId,
    printReserveEvent.id,
    pv,
    ProjectEventKey.printReservesEvent,
    terminal
  );
}

export function handleAddToBalance(event: AddToBalance): void {
  const addToBalance = new AddToBalanceEvent(
    idForProjectTx(event.params.projectId, pv, event, true)
  );
  const projectId = idForProject(event.params.projectId, pv);
  const project = Project.load(projectId);

  if (!project) {
    log.error("[handleAddToBalance] Missing project. ID:{}", [
      idForProject(event.params.projectId, pv),
    ]);
    return;
  }

  project.currentBalance = project.currentBalance.plus(event.params.value);
  project.save();

  if (addToBalance) {
    addToBalance.pv = pv.toString();
    addToBalance.terminal = terminal;
    addToBalance.projectId = event.params.projectId.toI32();
    addToBalance.amount = event.params.value;
    addToBalance.amountUSD = v1USDPriceForEth(event.params.value);
    addToBalance.caller = event.transaction.from;
    addToBalance.project = projectId;
    addToBalance.timestamp = event.block.timestamp.toI32();
    addToBalance.txHash = event.transaction.hash;
    addToBalance.save();

    saveNewProjectTerminalEvent(
      event,
      event.params.projectId,
      addToBalance.id,
      pv,
      ProjectEventKey.addToBalanceEvent,
      terminal
    );
  }
}

export function handleDistributeToPayoutMod(
  event: DistributeToPayoutMod
): void {
  const distributeToPayoutModEvent = new DistributeToPayoutModEvent(
    idForProjectTx(event.params.projectId, pv, event, true)
  );
  const projectId = idForProject(event.params.projectId, pv);

  if (!distributeToPayoutModEvent) return;

  distributeToPayoutModEvent.projectId = event.params.projectId.toI32();
  distributeToPayoutModEvent.tapEvent = idForProjectTx(
    event.params.projectId,
    pv,
    event
  );
  distributeToPayoutModEvent.project = projectId;
  distributeToPayoutModEvent.caller = event.transaction.from;
  distributeToPayoutModEvent.projectId = event.params.projectId.toI32();
  distributeToPayoutModEvent.fundingCycleId = event.params.fundingCycleId;
  distributeToPayoutModEvent.modProjectId = event.params.mod.projectId.toI32();
  distributeToPayoutModEvent.modBeneficiary = event.params.mod.beneficiary;
  distributeToPayoutModEvent.modAllocator = event.params.mod.allocator;
  distributeToPayoutModEvent.modPreferUnstaked =
    event.params.mod.preferUnstaked;
  distributeToPayoutModEvent.modCut = event.params.modCut;
  distributeToPayoutModEvent.modCutUSD = v1USDPriceForEth(event.params.modCut);
  distributeToPayoutModEvent.timestamp = event.block.timestamp.toI32();
  distributeToPayoutModEvent.txHash = event.transaction.hash;

  distributeToPayoutModEvent.save();

  saveNewProjectTerminalEvent(
    event,
    event.params.projectId,
    distributeToPayoutModEvent.id,
    pv,
    ProjectEventKey.distributeToPayoutModEvent,
    terminal
  );
}

export function handleDistributeToTicketMod(
  event: DistributeToTicketMod
): void {
  const distributeToTicketModEvent = new DistributeToTicketModEvent(
    idForProjectTx(event.params.projectId, pv, event, true)
  );
  const projectId = idForProject(event.params.projectId, pv);

  if (!distributeToTicketModEvent) return;

  distributeToTicketModEvent.printReservesEvent = idForProjectTx(
    event.params.projectId,
    pv,
    event
  );
  distributeToTicketModEvent.caller = event.transaction.from;
  distributeToTicketModEvent.modBeneficiary = event.params.mod.beneficiary;
  distributeToTicketModEvent.modPreferUnstaked =
    event.params.mod.preferUnstaked;
  distributeToTicketModEvent.modCut = event.params.modCut;
  distributeToTicketModEvent.projectId = event.params.projectId.toI32();
  distributeToTicketModEvent.fundingCycleId = event.params.fundingCycleId;
  distributeToTicketModEvent.txHash = event.transaction.hash;
  distributeToTicketModEvent.timestamp = event.block.timestamp.toI32();
  distributeToTicketModEvent.project = projectId;

  distributeToTicketModEvent.save();

  saveNewProjectTerminalEvent(
    event,
    event.params.projectId,
    distributeToTicketModEvent.id,
    pv,
    ProjectEventKey.distributeToTicketModEvent,
    terminal
  );
}
