const util = require('util');
const exec = util.promisify(require('child_process').exec);

const path = require('path');
const fs = require('fs/promises');
const https = require('https');
const crypto = require('crypto');
const styleTextOrg = require('node:util').styleText

function styleText(color, text) {
    // Github actions don't have a real tty, so styleText will normally output monochrome text.
    // But we check if the "CI" env variable is set to "true" and if so, we disable the stream validation.
    return styleTextOrg(color, text, { validateStream: process.env.CI !== "true" })
}

function httpGet(url, resolve, reject) {
    https.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
            httpGet(response.headers.location, resolve, reject);
            return
        }
        if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return
        }

        const hash = crypto.createHash('sha256');
        response.on('error', (err) => {
            reject(err);
        })
        response.on('data', (chunk) => {
            hash.update(chunk);
        })
        response.on('end', () => {
            const digest = hash.digest('hex');
            resolve(digest);
        })
    })
}

async function shaFromUrl(url) {
    return new Promise((resolve, reject) => {
        httpGet(url, resolve, reject)
    })
}

async function checkSource(source) {
    console.log(`Checking ${styleText('blue', source.url)}`);
    try {
        const actualSha = await shaFromUrl(source.url)

        if (actualSha !== source.sha256) {
            console.error(`Hash mismatch for ${styleText('red', source.url)}: expected ${styleText('green', source.sha256)} but got ${styleText('red', actualSha)}`);
            return 1;
        }
    } catch (e) {
        console.error(`Failed to check ${styleText('red', source.url)}: ${e.message}`);
        return 1;
    }

    return 0;
}

async function main(argv) {
    const from = argv[2] || 'main';
    const to = argv[3] || 'HEAD';

    console.log(`Checking for changes from ${styleText('blue', from)} to ${styleText('blue', to)}`);
    const { stdout, stderr } = await exec(`git diff --name-only ${from}...${to}`);
    if (stderr) {
        console.error(stderr);
        return 1;
    }

    const filesToCheck = stdout
        .split('\n')
        .filter(file => file.includes('registry') && path.basename(file) === 'extension.json')

    const failedHashes
        = (await Promise.all(
            (await Promise.all(
                filesToCheck
                    .map(async file => JSON.parse(await fs.readFile(file)))
                    .map(async content => Object.values((await content).versions))))
                .flat()
                .map(version => version.sources)
                .flat()
                .map(checkSource)))
            .reduce((acc, val) => acc + val, 0);

    if (failedHashes > 0) {
        console.error('Hash check failed');
        return failedHashes;
    }

    if (filesToCheck.length > 0)
        console.log(styleText('green', 'All hashes match'));
    else
        console.log(styleText('green', 'No extension changed'));
    return 0
}



main(process.argv).then((code) => {
    process.exit(code)
})
