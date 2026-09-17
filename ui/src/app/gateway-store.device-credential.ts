// "Forget this browser" stored device-credential reset, split out of
// gateway-store.ts to keep that module inside the TS LOC ratchet. Token-only
// and gateway-scoped: the browser device identity and other gateways' stored
// tokens survive.
import { CONTROL_UI_OPERATOR_ROLE } from "../api/gateway.ts";
import {
  clearDeviceAuthToken,
  loadDeviceAuthToken,
  peekStoredDeviceIdentityId,
} from "../lib/nodes/index.ts";
import type { ApplicationGateway, ApplicationGatewayConnectOptions } from "./gateway.ts";

type DeviceCredentialHost = {
  /** Live connection state owned by the store; gatewayUrl reads stay current. */
  connection: { readonly gatewayUrl: string };
  connect: (overrides: ApplicationGatewayConnectOptions) => void;
  isStopped: () => boolean;
};

export function createDeviceCredentialMethods(
  host: DeviceCredentialHost,
): Required<Pick<ApplicationGateway, "hasStoredDeviceToken" | "forgetDeviceToken">> {
  const storedOperatorDeviceToken = () => {
    const deviceId = peekStoredDeviceIdentityId();
    if (!deviceId) {
      return null;
    }
    const entry = loadDeviceAuthToken({
      deviceId,
      gatewayUrl: host.connection.gatewayUrl,
      role: CONTROL_UI_OPERATOR_ROLE,
    });
    return entry ? { deviceId } : null;
  };
  return {
    hasStoredDeviceToken: () => storedOperatorDeviceToken() !== null,
    forgetDeviceToken: () => {
      const stored = storedOperatorDeviceToken();
      if (!stored) {
        return false;
      }
      // Token-only reset: keep the browser device identity so the gateway can
      // mint a fresh token for the same device on the next pairing/login.
      clearDeviceAuthToken({
        deviceId: stored.deviceId,
        gatewayUrl: host.connection.gatewayUrl,
        role: CONTROL_UI_OPERATOR_ROLE,
      });
      // A stopped gateway stays on the login gate; the cleared credential
      // simply won't be offered on the next explicit connect.
      if (!host.isStopped()) {
        // Connection auth selects shared/bootstrap tokens ahead of stored
        // device auth, so this tab's session credentials must go too or the
        // reconnect silently resumes the old session instead of fresh auth.
        host.connect({ token: "", bootstrapToken: "", password: "" });
      }
      return true;
    },
  };
}
