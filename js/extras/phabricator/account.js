import PhabricatorClient from './phabricator_client';


export default class PhabricatorAccount {
  constructor(universe, accountDef, foldersTOC, dbConn/*, receiveProtoConn*/) {
    this.universe = universe;
    this.id = accountDef.id;
    this.accountDef = accountDef;

    this._db = dbConn;

    this.enabled = true;
    this.problems = [];

    this.identities = accountDef.identities;

    this.foldersTOC = foldersTOC;
    this.folders = this.foldersTOC.items;

    this.client = new PhabricatorClient({
      serverUrl: accountDef.serverUrl,
      apiToken: accountDef.credentials.apiKey,
    });
  }

  toString() {
    return `[PhabricatorAccount: ${this.id}]`;
  }

  // TODO: evaluate whether the account actually wants to be a RefedResource
  // with some kind of reaping if all references die and no one re-acquires it
  // within some timeout horizon.
  __acquire() {
    return Promise.resolve(this);
  }
  __release() {
  }

  // TODO: Other account types use a callback argument, they will need to be
  // adapted.
  async checkAccount() {
    return null;
  }

  shutdown() {
    // Nothing to actually shutdown.
  }
}

PhabricatorAccount.type = 'phabricator';
PhabricatorAccount.supportsServerFolders = false;