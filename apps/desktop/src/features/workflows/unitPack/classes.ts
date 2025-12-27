import {
  ID_CYNTRA_BEADS_UPDATE_ISSUE,
  ID_CYNTRA_KERNEL_EVENTS_STREAM,
  ID_CYNTRA_KERNEL_SNAPSHOT,
} from "./ids";
import { CyntraBeadsUpdateIssueUnit } from "./units/CyntraBeadsUpdateIssueUnit";
import { CyntraKernelEventsStreamUnit } from "./units/CyntraKernelEventsStreamUnit";
import { CyntraKernelSnapshotUnit } from "./units/CyntraKernelSnapshotUnit";

export const CYNTRA_UNIT_CLASSES: Record<string, unknown> = {
  [ID_CYNTRA_KERNEL_SNAPSHOT]: CyntraKernelSnapshotUnit,
  [ID_CYNTRA_KERNEL_EVENTS_STREAM]: CyntraKernelEventsStreamUnit,
  [ID_CYNTRA_BEADS_UPDATE_ISSUE]: CyntraBeadsUpdateIssueUnit,
};
