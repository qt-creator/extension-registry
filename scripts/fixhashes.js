import { readFile, writeFile } from 'fs/promises';
import { get } from 'https';
import { createHash } from 'crypto';
import { styleText } from 'node:util';

function httpGet(url, resolve, reject) {
    get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
            httpGet(response.headers.location, resolve, reject);
            return
        } else if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return
        }

        const hash = createHash('sha256');
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
            if (!source.sha256) {
                console.error(`No hash found for ${styleText('red', source.url)}, setting it to ${styleText('green', actualSha)}`);
                source.sha256 = actualSha;
                return;
            }
            console.error(`Hash mismatch for ${styleText('red', source.url)}: expected ${styleText('green', source.sha256)} but got ${styleText('red', actualSha)}, changing the hash.`);
            source.sha256 = actualSha;
        }
    } catch (e) {
        console.error(`Failed to check ${styleText('red', source.url)}: ${e.message}`);
    }
}

async function main(argv) {
    const extensionJsonPath = argv[2];

    if (!extensionJsonPath) {
        console.error('You need to specify the path to the extension.json');
        return 1;
    }

    let extensionJson = JSON.parse(await readFile(extensionJsonPath, 'utf-8'));

    for (let version in extensionJson.versions) {
        const v = extensionJson.versions[version];
        await Promise.all(await v.sources.map(checkSource));
    }

    await writeFile(extensionJsonPath, JSON.stringify(extensionJson, null, 4));
}



main(process.argv).then((code) => {
    process.exit(code)
})
