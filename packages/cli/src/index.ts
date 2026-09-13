#!/usr/bin/env node
import { Command } from 'commander'
import { connectCommand } from './commands/connect.js'
import { accountsCommand } from './commands/accounts.js'
import { postCommand } from './commands/post.js'

const program = new Command('opensocial')
  .description('Post to social platforms from local pipelines. BYO credentials.')
  .version('0.1.0')

program.command('connect <platform>').description('Connect an account via OAuth').action(connectCommand)
program.command('accounts').description('List connected accounts').action(accountsCommand)
program
  .command('post')
  .description('Publish a post to one or more platforms')
  .requiredOption('--to <platforms>', 'comma-separated: instagram,tiktok')
  .option('--text <text>', 'post text / caption')
  .option('--media <path-or-url...>', 'media files or public URLs')
  .option('--thumb-offset <ms>', 'reel cover frame in ms from start (Instagram)')
  .option('--json', 'read full Post JSON from stdin; emit JSON results')
  .action(postCommand)

program.parseAsync().catch((err: Error) => {
  console.error(err.message)
  process.exit(1)
})
