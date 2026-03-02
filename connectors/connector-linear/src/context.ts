/**
 * LinearContext — Context definition for Linear connector.
 */

import { Context } from "@max/core";
import type { LinearClient } from "./linear-client.js";

export class LinearContext extends Context {
  api = Context.instance<LinearClient>();
}
