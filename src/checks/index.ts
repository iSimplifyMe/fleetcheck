/** Check registry. Checks are registered here as they are implemented. */

import type { Check } from "../types.js";

// Universal checks apply to every repo.
// next/ checks apply only when `next` is a dependency (enforced via Check.appliesTo).
export const allChecks: Check[] = [];
