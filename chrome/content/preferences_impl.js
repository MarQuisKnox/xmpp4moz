/*
 * Copyright 2006-2007 by Massimiliano Mirra
 * 
 * This file is part of xmpp4moz.
 * 
 * xmpp4moz is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License, or (at your
 * option) any later version.
 * 
 * xmpp4moz is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 * Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
 *  
 */


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

var appInfo =Cc['@mozilla.org/xre/app-info;1']
    .getService(Ci.nsIXULAppInfo);
var prompts = Cc['@mozilla.org/embedcomp/prompt-service;1']
    .getService(Ci.nsIPromptService); 
var pref = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.account.');

var ns_register = 'jabber:iq:register';


// GLOBAL STATE
// ----------------------------------------------------------------------

var selectedAccountKey;


// GUI UTILITIES (GENERIC)
// ----------------------------------------------------------------------

function _(id) {
    return document.getElementById(id);
}

function v(id) {
    return _(id).value;
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function refreshAccountList() {
    for(var i=_('xmpp-accounts').getRowCount()-1; i>=0; i--) 
        _('xmpp-accounts').removeItemAt(i);

    XMPP.accounts.forEach(
        function(account) {
            _('xmpp-accounts').appendItem(account.jid, account.key);    
        });
}

function showAccount(accountKey) {
    selectedAccountKey = accountKey;

    function uncamelize(string) {
        return string
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase() 
    }

    _('xmpp-account-message').hidden = true;
    _('xmpp-account-settings').hidden = false;
    var account = XMPP.getAccountByKey(accountKey);

    for each(var accountField in
             ['address', 'password', 'resource', 'autoLogin',
              'connectionHost', 'connectionPort', 'connectionSecurity']) {
        var prefName = account.key + '.' + accountField;
        var elementId = 'xmpp-' + uncamelize(accountField);
            
        var prefValue;
        try {
            prefValue = pref.getCharPref(prefName);
        } catch(e) {
            try {
                prefValue = pref.getIntPref(prefName);
            } catch(e) {
                try {
                    prefValue = pref.getBoolPref(prefName);
                } catch(e) {
                    prefValue = '';
                }
            }
        }

        if(typeof(prefValue) == 'boolean')
            _(elementId).checked = prefValue;
        else
            _(elementId).value = prefValue;
    }
}

function createAccount() {
    var newAccountKey = (new Date()).getTime();
    
    pref.setCharPref(newAccountKey + '.address', 'new.user@sameplace.cc');
    pref.setCharPref(newAccountKey + '.resource', appInfo.name);
    pref.setCharPref(newAccountKey + '.password', '');
    pref.setBoolPref(newAccountKey + '.autoLogin', true);
    pref.setCharPref(newAccountKey + '.connectionHost', 'sameplace.cc');
    pref.setIntPref(newAccountKey + '.connectionPort', 5223);
    pref.setIntPref(newAccountKey + '.connectionSecurity', 1);

    refreshAccountList();
    showAccount(newAccountKey);
}

function deleteAccount(accountKey) {
    // TODO: ask for confirmation here
    accountKey = accountKey || selectedAccountKey;
    if(!accountKey)
        return;

    pref.deleteBranch(accountKey + '.');

    refreshAccountList();
    _('xmpp-account-message').hidden = false;
    _('xmpp-account-settings').hidden = true;
}

function registerAccount(address, host, port, ssl) {
    var jid = address;

    var request = {
        confirm: false,
        query: undefined
    };

    XMPP.open(
        jid, { host: host, port: port, ssl: ssl },
        function() {
            XMPP.send(
                jid,
                <iq to={XMPP.JID(jid).hostname} type="get">
                <query xmlns="jabber:iq:register"/>
                </iq>,
                function(reply) {
                    request.query = reply.stanza.ns_register::query;
                    if(request.query.ns_register::username.text() == undefined)
                        request.query.ns_register::username = XMPP.JID(jid).username;
                    if(request.query.ns_register::password.text() == undefined)
                        request.query.ns_register::password = v('xmpp-password');

                    window.openDialog(
                        'chrome://xmpp4moz/content/ui/registration.xul',
                        'xmpp4moz-registration', 'modal,centerscreen',
                        request);
                    
                    if(request.confirm) {
                        var iq = <iq to={XMPP.JID(jid).hostname} type="set"/>;
                        iq.query = request.query;
                        XMPP.send(
                            jid, iq, function(reply) {
                                if(reply.stanza.@type == 'result') 
                                    prompts.alert(
                                        null, 'Registration successful',
                                        'Account successfully registered.');
                                else
                                    prompts.alert(
                                        null, 'Registration error', 
                                        reply.stanza.error.*[0].name().localName.replace(/-/g, ' ') +
                                        ' (' + reply.stanza.error.@code + ')');
                                    
                                XMPP.close(jid);
                            });
                        
                    } else {
                        XMPP.close(jid);
                    }
                });
        });
}


// GUI REACTIONS
// ----------------------------------------------------------------------

function changedField(field) {
    function camelize(string) {
        var parts = string.split('-');
        return parts[0] + 
            parts.slice(1).map(
                function(part) {
                    return part[0].toUpperCase() + part.slice(1);
                }).join();
    }

    var prefName = selectedAccountKey + '.' + camelize(field.id.replace(/^xmpp-/, ''));

    if('checked' in field) 
        pref.setBoolPref(prefName, field.checked);
    else
        try {
            pref.setCharPref(prefName, field.value);
        } catch(e) {
            pref.setIntPref(prefName, parseInt(field.value));
        }
    
    // XXX hackish
    if(field.id == 'xmpp-address') 
        changedField(_('xmpp-connection-host'));
}

function modifiedAddress(address) {
    var server = address.split('@')[1] || '';
    _('xmpp-connection-host').value =
        (server == 'gmail.com' ? 'talk.google.com' : server);
}

function requestedRegisterAccount() {
    registerAccount(v('xmpp-address'),
                    v('xmpp-connection-host'),
                    v('xmpp-connection-port') || 5223,
                    v('xmpp-connection-security') == 1 ? true : false)
}

function selectedAccount() {
    var addressItem = _('xmpp-accounts').selectedItem;
    if(!addressItem)
        return;
    showAccount(addressItem.value);
}
