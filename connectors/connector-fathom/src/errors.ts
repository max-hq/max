import { MaxError, NotAvailable } from "@max/core";

const ConnectorFathom = MaxError.boundary("connector-fathom");

export const ErrClientNotStarted = ConnectorFathom.define("client_not_started", {
  facets: [NotAvailable],
  message: () => "FathomConnection not started - call start() first",
});
