//---------------------------------------------------------------------
// Persisted Database
//---------------------------------------------------------------------

import {Changes} from "../changes";
import {Evaluation, Database} from "../runtime";

export class PersistedDatabase extends Database {

  onFixpoint(evaluation: Evaluation, changes: Changes) {
    super.onFixpoint(evaluation, changes);
  }

}

