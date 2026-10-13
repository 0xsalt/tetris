# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0-alpha] - 2026-10-13

### Added

- "Jev plays" mode: TypeSafe's Jev model picks where each piece lands, one piece a second, behind a switch under Next.
- The Jev panel shows the cost per call, the cost of the run, turns, tokens and average latency.
- Jev stops for the day at a spending cap, $1.50 by default.
- The README explains how to run Jev with your own TypeSafe key, what it costs and how a move works, with a demo GIF.
- AI agents get a setup-and-play guide in `llms.txt`.
- Jev logs each call with its game seed and piece number, and each finished game to `JEV_GAMES_FILE`.

### Changed

- Jev is off on every page load, and only the switch turns it on.
- Jev behind a proxy needs `JEV_ALLOWED_LOGINS`; without it, only `localhost` can turn Jev on.

### Security

- The Jev server refuses cross-site, non-JSON and unknown-host requests, caps request bodies at 16 KB and limits calls per minute.
- Pages carry a content security policy and refuse framing, and the server never follows a redirect with the key.
- Jev stays off when other users can read the key file.
- Off `localhost`, only Tailscale logins in `JEV_ALLOWED_LOGINS` can spend the Jev budget.

## [0.1.0-alpha] - 2026-03-03

### Added

- A browser Tetris game with hold, a next-piece preview and line-clear stats, served by a small Bun server.
- A live demo on GitHub Pages.
- Tests for scoring, the seven-piece bag, rotation and lock delay.

### Fixed

- Lock delay follows the Tetris guideline, so pieces no longer float, drift along walls or spin forever.
