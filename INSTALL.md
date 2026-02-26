# Installation

## Prerequisites

- [Bun](https://bun.sh) v1.0 or later

```bash
curl -fsSL https://bun.sh/install | bash
```

## Quick Start

```bash
git clone https://github.com/0xsalt/tetris-demo.git
cd tetris-demo
bun install
bun start
```

Open `http://localhost:3000` in your browser.

## Custom Port

```bash
PORT=8080 bun start
```

## Development Mode

Auto-restarts on file changes:

```bash
bun dev
```

## Run as a Background Service (systemd)

Create `~/.config/systemd/user/tetris-demo.service`:

```ini
[Unit]
Description=Tetris Demo
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/tetris-demo
ExecStart=/home/YOUR_USER/.bun/bin/bun run src/server.ts
Environment=PORT=9002
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Then enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable tetris-demo
systemctl --user start tetris-demo
```

Check status:

```bash
systemctl --user status tetris-demo
```
