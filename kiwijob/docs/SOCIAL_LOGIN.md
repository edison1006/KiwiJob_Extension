# Social login setup

KiwiJob supports Google Identity Services plus server-side OAuth authorization-code flows for GitHub and LinkedIn. A first social login creates the KiwiJob account; later logins reuse the same email account.

## Production callback URLs

Register these exact callback URLs with each provider:

- GitHub: `https://api.kiwijob.co.nz/auth/social/github/callback`
- LinkedIn: `https://api.kiwijob.co.nz/auth/social/linkedin/callback`

## GitHub

1. Create a GitHub OAuth App.
2. Set the homepage URL to `https://app.kiwijob.co.nz`.
3. Set the authorization callback URL to the GitHub callback above.
4. Store the credentials as `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` in the API environment.

KiwiJob requests `read:user user:email` and uses a verified GitHub email address to create or locate the account.

## LinkedIn

1. Create a LinkedIn Developer application.
2. Add the **Sign In with LinkedIn using OpenID Connect** product.
3. Add the LinkedIn callback above under authorized redirect URLs.
4. Store the credentials as `LINKEDIN_OAUTH_CLIENT_ID` and `LINKEDIN_OAUTH_CLIENT_SECRET` in the API environment.

KiwiJob requests only `openid profile email` and reads the standard OIDC UserInfo response.

## API public URL

Set `API_PUBLIC_URL=https://api.kiwijob.co.nz`. OAuth providers require the redirect URI sent during authorization and token exchange to match the registered callback exactly.

Never commit provider client secrets to the repository. Keep them in the deployment secret/environment store.
