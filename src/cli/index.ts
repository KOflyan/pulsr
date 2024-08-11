import { Command } from 'commander'
import * as pkg from '../../package.json'

import { configureStartCommand } from './action/start'
import { config } from '../config'
import { logger } from '../utils/logger.utils'

type CommandConfigurationFunction = (cmd: Command) => void

const program = new Command()

program
  .name(pkg.name)
  .version(pkg.version, '-v, --version')
  .option('--verbose', 'Enable debug logs')

const commandConfigurationFunctions: CommandConfigurationFunction[] = [configureStartCommand]

for (const configure of commandConfigurationFunctions) {
  configure(program)
}

export function run() {
  program.parse()

  config.verbose = program.getOptionValue('verbose') ?? false

  logger.debug(`Executing command with the following config: ${JSON.stringify(config, null, 2)}`)
}
