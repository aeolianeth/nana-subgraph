import { DataSourceContext } from "@graphprotocol/graph-ts";

import { DelegateDeployed } from "../../../generated/JBTiered721DelegateDeployer/JBTiered721DelegateDeployer";
import { JB721DelegateToken as JB721DelegateTokenTemplate } from "../../../generated/templates";
import { PV } from "../../enums";

const pv = PV.PV2;

/**
 * When a delegate is deployed, we create a new dataSource so we can
 * handle token transfers later.
 */
export function handleDelegateDeployed(event: DelegateDeployed): void {
  const address = event.params.newDelegate;

  const jbTiered721DelegateContext = new DataSourceContext();
  jbTiered721DelegateContext.setBigInt("projectId", event.params.projectId);
  jbTiered721DelegateContext.setString("pv", pv.toString());
  jbTiered721DelegateContext.setI32(
    "governanceType",
    event.params.governanceType
  );
  JB721DelegateTokenTemplate.createWithContext(
    address,
    jbTiered721DelegateContext
  );
}
