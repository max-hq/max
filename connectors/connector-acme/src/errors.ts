/**
 * ConnectorAcme boundary - domain-owned errors for @max/connector-acme.
 */

import { MaxError, NotAvailable } from "@max/core";

const ConnectorAcme = MaxError.boundary("connector-acme");

export const ErrClientNotStarted = ConnectorAcme.define("client_not_started", {
  facets: [NotAvailable],
  message: () => "AcmeConnection not started - call start() first",
});
