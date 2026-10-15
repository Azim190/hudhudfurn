// Imported first by CLI scripts: queue workers must not start inside one-off commands.
process.env.WORKERS_ENABLED = 'false';
export {};
