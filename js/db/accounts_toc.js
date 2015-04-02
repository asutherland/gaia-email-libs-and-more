define(function(require) {

let evt = require('evt');

let utils = require('../utils');
let bsearchMaybeExists = utils.bsearchMaybeExists;
let bsearchForInsert = utils.bsearchForInsert;

/**
 * Ordering accounts by their name, why not.  (It used to just be creation / id
 * order.)
 */
function accountDefComparator(a, b) {
  return a.name.localeCompare(b.name);
}

/**
 * Provides a list of all accountDefs known to the system.  These accounts need
 * not be loaded/active in memory.  (This differs from v1 where an account had
 * to be loaded to be reported, limiting our capability to lazy-load.)
 *
 * The data-representation provided to the front-end is a specialized wire-rep
 * that censors some data (passwords!), and XXX in the future will include some
 * overlay gunk.
 */
function AccountsTOC() {
  evt.Emitter.call(this);

  this.accountDefs = [];
  this.accountDefsById = new Map();
}
AccountsTOC.prototype = evt.mix({
  isKnownAccount: function(accountId) {
    return this.accountDefsById.has(accountId);
  },

  getAllItems: function() {
    return this.accountDefs.map(this.accountDefToWireRep);
  },

  addAccount: function(accountDef) {
    let idx = bsearchForInsert(this.accountDefs, accountDef,
                               accountDefComparator);
    this.accountDefs.splice(idx, 0, accountDef);
    this.accountDefsById.set(accountDef.id, accountDef);

    this.emit('add', this.accountDefToWireRep(accountDef), idx);
  },

  accountModified: function(accountDef) {
    // (Object identity holds here, and the number of accounts will always be
    // smallish, so just use indexOf.)
    let idx = this.accountDefs.indexOf(accountDef);
    if (idx === -1) {
      throw new Error('how do you have a different object?');
    }
    this.emit('change', this.accountDefToWireRep(accountDef), idx);
  },

  removeAccountById: function(accountId) {
    let accountDef = this.accountDefsById.get(accountId);
    let idx = this.accountDefs.indexOf(accountDef);

    this.accountDefsById.delete(accountId);
    this.accountDefs.splice(idx, 1);

    this.emit('remove', accountId, idx);
  },

  accountDefToWireRep: function(accountDef) {
    return {
      id: accountDef.id,
      name: accountDef.name,
      type: accountDef.type,

      defaultPriority: accountDef.defaultPriority,

      enabled: true, // XXX overlay mechanism or universe consultation?
      problems: [], // XXX ditto

      syncRange: accountDef.syncRange,
      syncInterval: accountDef.syncInterval,
      notifyOnNew: accountDef.notifyOnNew,
      playSoundOnSend: accountDef.playSoundOnSend,

      identities: accountDef.identities,

      credentials: {
        username: accountDef.credentials.username,
        outgoingUsername: accountDef.credentials.outgoingUsername,
        // no need to send the password to the UI.
        // send all the oauth2 stuff we've got, though.
        oauth2: accountDef.credentials.oauth2
      },

      servers: [
        {
          type: accountDef.receiveType,
          connInfo: accountDef.receiveConnInfo,
          activeConns: 0, // XXX overlay info but we have never used this
        },
        {
          type: accountDef.sendType,
          connInfo: accountDef.sendConnInfo,
          activeConns: 0, // XXX overlay info but we have never used this
        }
      ],
    };
  },

});

return AccountsTOC;
});