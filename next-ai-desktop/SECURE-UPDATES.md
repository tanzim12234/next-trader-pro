# NEXT AI signed update setup

The updater fails closed: it will not download or launch an installer unless the release manifest is signed by the trusted Ed25519 key embedded in that build and the installer SHA-256 and byte size match the signed manifest.

## One-time release key setup

Generate an Ed25519 key pair on a trusted machine:

```sh
openssl genpkey -algorithm ED25519 -out next-ai-update-private.pem
openssl pkey -in next-ai-update-private.pem -pubout -out next-ai-update-public.pem
```

Never commit or share the private key. Add the complete PEM contents as GitHub Actions repository secrets:

- `NEXT_AI_UPDATE_PRIVATE_KEY`: private PEM; used only by the release workflow to sign the manifest.
- `NEXT_AI_UPDATE_PUBLIC_KEY`: public PEM; embedded into the Windows build so the app can verify future manifests.

Both secrets must be configured for signed manifests to be published. Each build embeds the public key it was built with. Keep the private key backed up securely; losing it prevents future releases from being verified by existing installs. If the signing key must be rotated, use a planned transition that ships a build trusting both keys before removing the old one.

## Release behavior

The Windows workflow creates `update-manifest.json` only when both secrets exist. The manifest signs version, platform, architecture, HTTPS installer URL, SHA-256, size, and publication time. The app checks the latest GitHub release, verifies the Ed25519 signature, downloads with a strict size cap, verifies the installer hash again, and asks for native Windows confirmation before launching the installer.

Without both secrets, the ordinary installer build may still succeed, but secure in-app update checking remains disabled by design. Never replace this with unsigned auto-installation.
