/**
 * Fails with a clear message when the credentials of the automation GitHub App
 * are missing, before anything tries to use them.
 *
 * Parameters (environment variables):
 *   APP_CLIENT_ID    Client ID of the GitHub App.
 *   APP_PRIVATE_KEY  Private key of the GitHub App.
 */

import { readOptionalVariable } from '../infrastructure/environment.mjs';
import { WorkflowFailure, runWorkflowCommand } from '../infrastructure/workflow-report.mjs';

function checkAutomationCredentials() {
  const missingSettings = [];

  if (readOptionalVariable('APP_CLIENT_ID') === '') {
    missingSettings.push('la variable « AUTOMATION_APP_CLIENT_ID » (onglet Variables)');
  }

  if (readOptionalVariable('APP_PRIVATE_KEY') === '') {
    missingSettings.push('le secret « AUTOMATION_APP_PRIVATE_KEY » (onglet Secrets)');
  }

  if (missingSettings.length === 0) {
    return;
  }

  throw new WorkflowFailure('Identifiants de la GitHub App manquants', [
    `Il manque dans ce dépôt : ${missingSettings.join(' et ')}.`,
    'À définir dans Settings → Secrets and variables → Actions, puis à transmettre au workflow réutilisable (« automation-app-client-id » et « AUTOMATION_APP_PRIVATE_KEY »).',
    "Sans ces identifiants, le pipeline ne peut ni créer de branche ni ouvrir de pull request. La marche à suivre est décrite dans docs/installation.md du dépôt Github-ci.",
  ]);
}

await runWorkflowCommand(checkAutomationCredentials);
