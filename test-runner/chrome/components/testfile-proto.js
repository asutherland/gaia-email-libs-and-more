const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const CC = Components.Constructor;

dump('sourcing testfile-proto.js\n');

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

// Needed for DOMApplicationRegistry so we can map origin to AppId.
Cu.import('resource://gre/modules/Webapps.jsm');


const IOService = CC('@mozilla.org/network/io-service;1', 'nsIIOService')();
const URIChannel = IOService.newChannel.bind(IOService);

const SecurityManager = CC('@mozilla.org/scriptsecuritymanager;1',
                     'nsIScriptSecurityManager')();
const URI = IOService.newURI.bind(IOService);
// this forces no app-id, not generally what we want
const NoAppPrincipal = SecurityManager.getNoAppCodebasePrincipal.bind(
                         SecurityManager);
// this forces an app principal, could be what we want
const AppPrincipal = SecurityManager.getAppCodebasePrincipal.bind(
                       SecurityManager);
// this uses the principal of the load context... more right?
const LoadContextPrincipal =
        SecurityManager.getLoadContextCodebasePrincipal.bind(SecurityManager);

const URLParser = CC('@mozilla.org/network/url-parser;1?auth=maybe',
                     'nsIURLParser')();

const SimpleURI = CC('@mozilla.org/network/simple-uri;1', 'nsIURI');
const StandardURL = CC('@mozilla.org/network/standard-url;1', 'nsIStandardURL',
                       'init');

function do_get_file(path, allowNonexistent) {
  try {
    let lf = Components.classes["@mozilla.org/file/directory_service;1"]
      .getService(Components.interfaces.nsIProperties)
      .get("CurWorkD", Components.interfaces.nsILocalFile);

    let bits = path.split("/");
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) {
        if (bits[i] == "..")
          lf = lf.parent;
        else
          lf.append(bits[i]);
      }
    }

    if (!allowNonexistent && !lf.exists()) {
      var stack = Components.stack.caller;
      dump("MISSING FILE | " + stack.filename + " | [" +
            stack.name + " : " + stack.lineNumber + "] " + lf.path +
            " does not exist\n");
    }

    return lf;
  }
  catch (ex) {
    dump(ex.toString() + "\n" + Components.stack.caller + "\n");
  }

  return null;
}

var DEBUG = 0;

/**
 * Given our URI figure out what appId we ended up assigning to our app.
 */
function resolveUriToAppId(uri) {
  // lucky for us there's really only one manifest so its path is easy to
  // figure out.
  var manifestUrl = uri.prePath + '/test/manifest.webapp';
  var appId =  DOMApplicationRegistry.getAppLocalIdByManifestURL(manifestUrl);
  // dump ("!! appId is " + appId + " for " + manifestUrl + "\n");
  return appId;
}

function TestfileProtocolHandler() {
//dump('instantiating protocol!\n');
}
TestfileProtocolHandler.prototype = {
  classDescription: 'testfile protocol handler',
  classID: Components.ID('{14f565f2-8886-4b9e-92f6-d52b53d87464}'),
  contractID: '@mozilla.org/network/protocol;1?name=testfile',

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIProtocolHandler]),

  scheme: 'testfile',
  defaultPort: 443,
  protocolFlags: Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
                 Ci.nsIProtocolHandler.URI_SAFE_TO_LOAD_IN_SECURE_CONTEXT,
  allowPort: function() { return true; },

  newURI: function Proto_newURI(aSpec, aOriginCharset, aBaseURI) {
    if (DEBUG)
      dump('newURI! ' + aSpec + ' base? ' + (aBaseURI ? aBaseURI.spec : null) +
           '\n');
    if (aBaseURI) {
      let resolved = aBaseURI.resolve(aSpec);
      if (DEBUG)
        dump('resolved to: ' + resolved + '\n');
      return URI(resolved, null, null);
    }

    var uri = new StandardURL(
      Ci.nsIStandardURL.URLTYPE_STANDARD,
      443,
      aSpec,
      'utf-8',
      null);
    return uri;
  },

  newChannel2: function Proto_newChannel(aURI, aLoadInfo) {
    var relPath;
    if (aURI instanceof Ci.nsIURL)
      relPath = aURI.filePath;
    else
      relPath = aURI.path;
    if (DEBUG) {
      dump('trying to create channel for: ' + relPath + '\n');
    }
    var fileuri = IOService.newFileURI(do_get_file(relPath));
    var channel = IOService.newChannelFromURIWithLoadInfo(fileuri, aLoadInfo);
    if (DEBUG) {
      dump("channel load info: " + aLoadInfo.loadingPrincipal + " flags: " +
           aLoadInfo.securityFlags.toString(16) + " enforce: " +
           aLoadInfo.enforceSecurity + "\n");
    }
    channel.originalURI = aURI;

    // NOTE!  Originally we set the owner to the (deprecated) codebase
    // principal which is now the noapp principal.  Then I changed us to
    // use what I *thought* was a mozbrowser/mozapp iframe.  However, the good
    // 'ole "XUL iframes are different from HTML iframes" thing tricked me
    // and I ended up using the code below to force the protocol to have the
    // principal of the app.  However, it now turns out that once I addressed
    // the XUL/HTML iframe thing, we no longer seem to need to set the
    // principal.
    //
    // I'm leaving this code in here commented out because

    /*
    // Find the AppId
    var appId = resolveUriToAppId(aURI);
    // we want to act like an installed app, so we say false to being in a
    // mozBrowser.  (even though we have mozapp and mozbrowser)
    //channel.owner = AppPrincipal(aURI, appId, false);
    */

    // If we were actually doing the install the right way, we would potentially
    // want a content-type.  However that requires full nsIHttpChannel stuff
    // to work, so I'm commenting this out too since it does nothing.
    /*
    if (/\.webapp$/.test(aURI)) {
      channel.contentType = 'application/x-web-app-manifest+json';
    }
    */

    return channel;
  },
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([TestfileProtocolHandler]);
