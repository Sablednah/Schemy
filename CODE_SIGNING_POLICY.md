# Code signing policy

## Current status

Schemy is applying for free open-source code signing through SignPath Foundation. Until that application is approved and the signing workflow is enabled, published Schemy builds must be treated as unsigned.

Once approval and integration are complete, Windows release builds will carry the following attribution:

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## What may be signed

Only release artifacts built from the public [Schemy repository](https://github.com/Sablednah/Schemy) by the project's GitHub Actions workflow may be submitted for signing. Signing is limited to Schemy's own Windows application, native Explorer integration, installer, and uninstaller.

Locally built binaries, modified downstream builds, pull-request artifacts, forks, and binaries containing unpublished or proprietary Schemy code must not be submitted under the project's signing identity.

## Build and approval process

1. Source changes are committed to the public repository.
2. GitHub Actions builds and tests the release from that source.
3. The designated approver verifies the source revision, workflow result, version, and expected artifacts.
4. Only the verified release artifacts are approved for signing.
5. Signed artifacts are published without further modification. Any binary change requires a new build and signing request.

Project maintainers must use multi-factor authentication for GitHub and SignPath access. Signing credentials and approval access must not be shared or committed to the repository.

## Project roles

- Committer and reviewer: [Sablednah](https://github.com/Sablednah)
- Signing approver: [Sablednah](https://github.com/Sablednah)

As a single-maintainer project, these roles are currently held by the same person. This policy will be updated if additional maintainers or approvers join the project.

## Reporting concerns

Report suspected compromised builds, signing misuse, or security issues through the repository's [issue tracker](https://github.com/Sablednah/Schemy/issues). Do not install a release if its signature, checksum, source revision, or stated publisher cannot be verified.
