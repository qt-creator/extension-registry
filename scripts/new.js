
import { readFile, mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

import { styleText } from 'util';

import { createEnv, Table } from 'lua-in-js';

function jsonFromLuaSpec(luaCode) {
    const luaEnv = createEnv({
        LUA_PATH: '',
        fileExists: () => true,
        loadFile: () => {
            throw new Error('loadFile not allowed')
        },
        osExit: () => {
            throw new Error('osExit not allowed')
        },
        stdout: data => core.debug(data)
    })

    const luaSpecScript = luaEnv.parse(luaCode)
    const luaSpec = luaSpecScript.exec()

    if (!(luaSpec instanceof Table)) {
        throw new Error('Spec must be a table')
    }

    return luaSpec.toObject()
}

async function parseSpec(pathToSpec) {
    const content = await readFile(pathToSpec, 'utf-8')
    if (pathToSpec.endsWith('.json')) {
        return JSON.parse(content);
    }
    else if (pathToSpec.endsWith('.lua')) {
        return jsonFromLuaSpec(content);
    }
    throw new Error('Spec must be a json or lua file');
}

async function main(argv) {
    if (argv.length < 4) {
        console.error('Usage: node scripts/new.js <vendor.company/extension.json> <plugin.json/plugin.lua>');
        console.error('Example: node scripts/new.js company.myplugin/extension.json ~/builds/myplugin/myplugin.json');
        return 1;
    }

    const extensionJsonPath = argv[2];
    const pluginJsonPath = argv[3];

    const pluginJson = await parseSpec(pluginJsonPath);

    // Default if its a new extension
    let extensionJson = {
        $schema: "../../schema/extension.schema.json",
        info: {
            id: pluginJson.Id,
            vendor_id: pluginJson.VendorId,
            display_name: pluginJson.Name,
            display_vendor: pluginJson.Vendor,
            license: "open-source",
        },
        latest: pluginJson.Version,
        versions: {
            [pluginJson.Version]: {
                sources: [],
                metadata: pluginJson,
            },
        }
    };

    await mkdir(dirname(extensionJsonPath), { recursive: true })

    try {
        extensionJson = JSON.parse(await readFile(extensionJsonPath, 'utf-8'));
        if (extensionJson.versions[pluginJson.Version] !== undefined) {
            // TODO: Allow update?
            console.warn(`Version ${styleText('blue', pluginJson.Version)} already exists in ${styleText('blue', extensionJsonPath)}, overwriting it.`);
        }
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }

    extensionJson.versions[pluginJson.Version] = {
        sources: [],
        metadata: pluginJson,
    };
    extensionJson.latest = pluginJson.Version;

    await writeFile(extensionJsonPath, JSON.stringify(extensionJson, null, 4));
    console.log(`Updated ${styleText('green', extensionJsonPath)} with version ${styleText('green', pluginJson.Version)}`);
}

main(process.argv).then((code) => {
    process.exit(code)
})
