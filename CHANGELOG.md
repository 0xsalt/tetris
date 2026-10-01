# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project scaffolding with PROJECT-STANDARDS structure
- README: "Jev plays" demo GIF, a run-it-with-your-own-key section, and how a move flows between browser, server and TypeSafe
- `llms.txt` setup-and-play guide

### Security
- Jev server hardened per a CodeGuard review: open redirect closed; cross-site, non-JSON and unknown-Host requests to the paid endpoint refused; 16 KB body cap; rate limit; CSP and framing headers; no upstream redirects with the key; no development error pages
