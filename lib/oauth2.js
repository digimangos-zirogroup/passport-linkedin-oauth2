var util = require('util');
var OAuth2Strategy = require('passport-oauth2');
var InternalOAuthError = require('passport-oauth2').InternalOAuthError;

var DEFAULT_PROFILE_URL = 'https://api.linkedin.com/rest/identityMe';
var DEFAULT_LINKEDIN_VERSION = '202507';

function Strategy(options, verify) {
  options = options || {};
  options.authorizationURL =
    options.authorizationURL ||
    'https://www.linkedin.com/oauth/v2/authorization';
  options.tokenURL =
    options.tokenURL || 'https://www.linkedin.com/oauth/v2/accessToken';
  options.scope = options.scope || ['profile', 'email', 'openid'];

  var linkedInVersion = options.linkedinVersion || DEFAULT_LINKEDIN_VERSION;

  // Request identityMe in JSON and opt into a stable API version unless overridden
  options.customHeaders = Object.assign(
    {
      'LinkedIn-Version': linkedInVersion,
      'x-li-format': 'json',
    },
    options.customHeaders
  );

  OAuth2Strategy.call(this, options, verify);

  this.options = options;
  this.name = 'linkedin';
  this.profileUrl = options.profileUrl || DEFAULT_PROFILE_URL;
  this.linkedinVersion = linkedInVersion;
}

util.inherits(Strategy, OAuth2Strategy);

Strategy.prototype.userProfile = function (accessToken, done) {
  //LinkedIn uses a custom name for the access_token parameter
  this._oauth2.setAccessTokenName('oauth2_access_token');

  this._oauth2.get(
    this.profileUrl,
    accessToken,
    function (err, body, _res) {
      if (err) {
        return done(
          new InternalOAuthError('failed to fetch user profile', err)
        );
      }

      var profile;

      try {
        profile = parseProfile(body);
      } catch (e) {
        return done(
          new InternalOAuthError('failed to parse profile response', e)
        );
      }

      done(null, profile);
    }.bind(this)
  );
};

Strategy.prototype.authorizationParams = function (options) {
  var params = {};

  // LinkedIn requires state parameter. It will return an error if not set.
  if (options.state) {
    params['state'] = options.state;
  }

  return params;
};

function parseProfile(body) {
  var json = JSON.parse(body);
  var basicInfo = json.basicInfo || {};
  var givenName = getLocalizedValue(basicInfo.firstName);
  var familyName = getLocalizedValue(basicInfo.lastName);

  return {
    provider: 'linkedin',
    id: normalizeId(json.id || json.sub),
    email: basicInfo.primaryEmailAddress,
    givenName: givenName,
    familyName: familyName,
    displayName: buildDisplayName(givenName, familyName),
    picture: getPictureUrl(basicInfo.profilePicture),
    profileUrl: basicInfo.profileUrl,
    _raw: body,
    _json: json,
  };
}

function getLocalizedValue(field) {
  if (!field) {
    return undefined;
  }

  if (typeof field === 'string') {
    return field;
  }

  var localized = field.localized || {};
  var preferred = field.preferredLocale;

  if (preferred) {
    var localeKey = preferred.language;
    if (preferred.country) {
      localeKey += '_' + preferred.country;
    }

    if (localized[localeKey]) {
      return localized[localeKey];
    }
  }

  var locales = Object.keys(localized);
  if (locales.length > 0) {
    return localized[locales[0]];
  }

  return undefined;
}

function buildDisplayName(givenName, familyName) {
  if (givenName && familyName) {
    return givenName + ' ' + familyName;
  }

  return givenName || familyName;
}

function getPictureUrl(profilePicture) {
  if (!profilePicture) {
    return undefined;
  }

  if (
    profilePicture.croppedImage &&
    profilePicture.croppedImage.downloadUrl
  ) {
    return profilePicture.croppedImage.downloadUrl;
  }

  if (
    profilePicture.originalImage &&
    profilePicture.originalImage.downloadUrl
  ) {
    return profilePicture.originalImage.downloadUrl;
  }

  return undefined;
}

function normalizeId(id) {
  if (typeof id !== 'string') {
    return id;
  }

  var prefix = 'urn:li:person:';
  if (id.indexOf(prefix) === 0) {
    return id.slice(prefix.length);
  }

  return id;
}

module.exports = Strategy;
Strategy.DEFAULT_PROFILE_URL = DEFAULT_PROFILE_URL;
Strategy.DEFAULT_LINKEDIN_VERSION = DEFAULT_LINKEDIN_VERSION;
