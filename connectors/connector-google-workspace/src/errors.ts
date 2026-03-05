import { MaxError, ErrFacet, InvariantViolated, BadInput } from "@max/core";

export const GoogleWorkspace = MaxError.boundary("google-workspace");

export const ErrGoogleWorkspaceNotStarted = GoogleWorkspace.define("not_started", {
  facets: [InvariantViolated],
  message: () => "GoogleWorkspaceClient not started -- call start() first",
});

export const ErrGoogleWorkspaceApiError = GoogleWorkspace.define("api_error", {
  customProps: ErrFacet.props<{ status: number; statusText: string }>(),
  facets: [],
  message: (d) => `Google Workspace API error: ${d.status} ${d.statusText}`,
});

export const ErrGoogleWorkspaceJwtSigningFailed = GoogleWorkspace.define("jwt_signing_failed", {
  customProps: ErrFacet.props<{ reason: string }>(),
  facets: [],
  message: (d) => `JWT signing failed: ${d.reason}`,
});

export const ErrGoogleWorkspaceServiceAccountKeyInvalid = GoogleWorkspace.define("service_account_key_invalid", {
  customProps: ErrFacet.props<{ reason: string }>(),
  facets: [BadInput],
  message: (d) => `Service account key is invalid: ${d.reason}`,
});
