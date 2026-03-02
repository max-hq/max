/**
 * Shared MaxProjectApp bootstrap for examples.
 *
 * Points at bun-test-project/ which has a .max directory with installations.
 * Usage: import { app } from "./app.js"
 */

import * as path from 'node:path'
import { EntityInput, Projection } from '@max/core'
import { BunPlatform } from '@max/platform-bun'
import { AcmeConfig, AcmeUser } from '@max/connector-acme'
import * as os from "node:os";
import * as fs from "node:fs";

const tmpRoot = fs.mkdtempSync(os.tmpdir())
const maxRoot = path.join(tmpRoot, '.max')
const dataDir = path.join(tmpRoot, 'test-workspace')
fs.mkdirSync(maxRoot)
fs.mkdirSync(dataDir)


console.log("Creating max deployment using folders:", {maxRoot,dataDir})

try {
  const max = BunPlatform.createGlobalMax({
    global:{
      root: () => maxRoot
    }
  })

  const workspaceId = await max.createWorkspace(
    'test-workspace', // we don't need this anymore, it can come from the spec
    {
      via: BunPlatform.workspace.deploy.inProcess,
      config:{
        strategy: 'in-process',
        dataDir,
        engine:{type: 'sqlite'},
        connectorRegistry: {type:'hardcoded', moduleMap: { 'acme': '@max/connector-acme'}}
      },
      spec:{
        name: "test-workspace",
      }
    }
  )

  const workspace = max.workspace(workspaceId)

  // ACTUALLY: We're trying to achieve the wrong thing here. We should either:
  // 1. Be 100% ephemeral - spin up an in-memory max and an in-memory acme and e2e test it
  // 2. Use "connect" here rather than create - and connect to the existing installation in bun-test-project
  // ^ That means that we need to implement logic in BunPlatform's "connect" that will re-create the installation client from the dependency config in the max.json file
  const acmeId = await workspace.createInstallation({
    via: BunPlatform.installation.deploy.inProcess,
    spec: {
      connector: 'acme',
      name: 'default',
      connectorConfig: { workspaceId: '1', baseUrl: 'none' } satisfies AcmeConfig,
      initialCredentials: { api_token: "123" }
    },
    config: {
      strategy: 'in-process',
      dataDir
    }
  })

  const acme = await workspace.installation(acmeId)

  await acme.engine.store<AcmeUser>(EntityInput.create<AcmeUser>(AcmeUser.ref('user-1'), {
    displayName: 'Round-tripped user',
    email: 'test-1@test.com'
  }))

  console.log("Installation, workspace and engine successful. Output:", {
    installations: await workspace.listInstallations(),
    data: await workspace.health(),
    acme: await acme.engine.load(
      AcmeUser.ref('user-1'),
      Projection.all
    ),
  })
} catch (e) {
  console.error(e)
}
