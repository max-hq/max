import { Context } from "@max/core";
import type { FathomClientProvider } from "./fathom-client.js";

export class FathomAppContext extends Context {
  api = Context.instance<FathomClientProvider>();
  maxPages = Context.number;
}
