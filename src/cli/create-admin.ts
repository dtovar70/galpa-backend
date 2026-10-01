/**
 * Creates the first ADMIN of a fresh production database (no demo data):
 *
 *   node dist/cli/create-admin.js --email dueña@ejemplo.com --name "Dueña"
 *
 * The password comes from ADMIN_PASSWORD, or is asked for (hidden, twice) when the terminal is
 * interactive; piped stdin is read as the password too. Uses DATABASE_URL (from the environment
 * or a .env file). Does nothing when an active ADMIN already exists. Exit code 1 on any error.
 */
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { User } from '../auth/entities/user.entity.js'
import { createFirstAdmin, firstAdminInputErrors } from '../users/first-admin.js'

const USAGE = `Usage: node dist/cli/create-admin.js --email <email> --name <name>
Password: ADMIN_PASSWORD environment variable, or an interactive (hidden) prompt.`

/** Reads one line without echoing it (raw mode); Ctrl+C cancels. */
function promptHidden(question: string): Promise<string> {
    const { stdin, stdout } = process
    stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    return new Promise((resolve, reject) => {
        let value = ''
        const finish = (error?: Error) => {
            stdin.off('data', onData)
            stdin.setRawMode(false)
            stdin.pause()
            stdout.write('\n')
            if (error) reject(error)
            else resolve(value)
        }
        const onData = (chunk: string) => {
            for (const char of chunk) {
                if (char === '\r' || char === '\n' || char === '\u0004') return finish()
                if (char === '\u0003') return finish(new Error('Cancelled.'))
                if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
                else value += char
            }
        }
        stdin.on('data', onData)
    })
}

/** The first line of a piped stdin. */
async function readPipedLine(): Promise<string> {
    const lines = createInterface({ input: process.stdin, terminal: false })
    for await (const line of lines) {
        lines.close()
        return line
    }
    return ''
}

async function readPassword(): Promise<string> {
    const fromEnv = process.env.ADMIN_PASSWORD
    if (fromEnv) return fromEnv
    if (!process.stdin.isTTY) return readPipedLine()
    const password = await promptHidden('Password: ')
    const again = await promptHidden('Repeat the password: ')
    if (password !== again) throw new Error('The passwords do not match.')
    return password
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            email: { type: 'string' },
            name: { type: 'string' },
            help: { type: 'boolean', short: 'h' },
        },
    })
    if (values.help) {
        console.log(USAGE)
        return
    }
    if (!values.email || !values.name) throw new Error(`--email and --name are required.\n${USAGE}`)

    const input = { email: values.email, name: values.name, password: await readPassword() }
    const errors = firstAdminInputErrors(input)
    if (errors.length) throw new Error(errors.join('\n'))

    // Imported here so --help and argument errors work without DATABASE_URL.
    const { default: dataSource } = await import('../database/data-source.js')
    await dataSource.initialize()
    try {
        const result = await createFirstAdmin(dataSource.getRepository(User), input)
        if (result.created) {
            console.log(`ADMIN created: ${result.email}`)
        } else if (result.reason === 'admin-exists') {
            console.log('An active ADMIN already exists; nothing was changed.')
        } else {
            throw new Error('A user with that email already exists; nothing was changed.')
        }
    } finally {
        await dataSource.destroy()
    }
}

try {
    await main()
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
}
