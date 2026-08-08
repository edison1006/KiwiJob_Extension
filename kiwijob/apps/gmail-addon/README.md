# KiwiJob Gmail Add-on

This HTTP Google Workspace Add-on reads only the Gmail message the user has open. It previews a detected job-status change and updates KiwiJob only after the user selects **Sync status to KiwiJob**.

## Google Cloud deployment

1. Enable the Google Workspace Marketplace SDK and Google Workspace Add-ons API in the KiwiJob Google Cloud project.
2. Create an HTTP deployment using `deployment.json`, or run:

   ```sh
   gcloud workspace-add-ons deployments create kiwijob --deployment-file=deployment.json
   ```

3. Run `gcloud workspace-add-ons get-authorization` and copy its OAuth client ID and service account email.
4. Configure the API environment:

   ```text
   GOOGLE_WORKSPACE_ADDON_CLIENT_ID=<authorization resource OAuth client ID>
   GOOGLE_WORKSPACE_ADDON_SERVICE_ACCOUNT_EMAIL=<authorization resource service account email>
   GOOGLE_WORKSPACE_ADDON_AUDIENCE=https://api.kiwijob.co.nz/integrations/gmail-addon
   ```

5. Install the unpublished deployment for testing. After a Marketplace listing exists, set `VITE_GMAIL_ADDON_INSTALL_URL` in the web app to its installation URL.

The manifest intentionally excludes `gmail.readonly`. It uses the non-sensitive `gmail.addons.current.message.action` scope and Google-provided temporary current-message access tokens.
