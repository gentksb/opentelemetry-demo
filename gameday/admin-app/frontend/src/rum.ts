import SplunkRum from '@splunk/otel-web';

const token = import.meta.env.VITE_SPLUNK_RUM_TOKEN;
const realm = import.meta.env.VITE_SPLUNK_REALM;
const version = import.meta.env.VITE_APP_VERSION || 'dev';

const TEAM_ID_ATTR = 'team.id';

if (token && realm) {
  SplunkRum.init({
    realm,
    rumAccessToken: token,
    applicationName: 'gameday-admin',
    deploymentEnvironment: import.meta.env.VITE_DEPLOYMENT_ENV || 'dev',
    globalAttributes: {
      'service.version': version,
    },
  });
}

export function setRumTeamId(teamId: string | null): void {
  if (!token || !realm) return;
  const current = SplunkRum.getGlobalAttributes();
  if (teamId) {
    SplunkRum.setGlobalAttributes({ ...current, [TEAM_ID_ATTR]: teamId });
  } else {
    const { [TEAM_ID_ATTR]: _, ...rest } = current;
    SplunkRum.setGlobalAttributes(rest);
  }
}
