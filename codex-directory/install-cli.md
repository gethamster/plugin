## Install the CLI

If `hamster` is not on PATH (also look in `~/.hamster/bin`), the user installs the Hamster CLI themselves. Do not download, fetch, or run an installer, and do not run the install commands on the user's behalf.

Tell the user that setup needs the Hamster CLI, and ask them to install it in their own terminal by following https://github.com/gethamster/plugin#advanced-cli-binary. Then wait until they say it is installed.

When they do, check that `hamster` is now on PATH (also look in `~/.hamster/bin`). If it is still missing, tell the user and stop. Otherwise put `~/.hamster/bin` on PATH for this session.
