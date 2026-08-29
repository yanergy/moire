// electron-builder afterPack hook. On macOS, electron-builder renames the Electron
// binary to the product name, which invalidates its code signature; without a real
// "Developer ID" identity it then skips signing, leaving an unsigned/broken binary.
// Apple Silicon refuses to run that (it traps on launch, even for --version). So we
// ad-hoc sign the whole app here (via @electron/osx-sign, which signs the framework
// and helper apps with the correct Electron entitlements, unlike a plain codesign).
// This makes a local, unsigned build runnable out of the box; a real identity, when
// configured, is used by electron-builder's own signing step instead.

const path = require('node:path');

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== 'darwin') {
        return;
    }

    const { signAsync } = require('@electron/osx-sign');
    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(context.appOutDir, `${appName}.app`);
    const entitlements = path.join(__dirname, 'entitlements.mac.plist');

    await signAsync({
        app: appPath,
        identity: '-', // ad-hoc
        // Skip the keychain lookup, so '-' passes straight to codesign as ad-hoc
        // rather than being validated as a real identity.
        identityValidation: false,
        gatekeeperAssess: false,
        // Apply our entitlements to every binary (main and each helper), not just
        // the app: osx-sign's default entitlements omit disable-library-validation,
        // and every process that loads the ad-hoc Electron Framework needs it.
        optionsForFile: () => ({ hardenedRuntime: true, entitlements }),
    });

    console.log(`  • ad-hoc signed (afterPack) ${appPath}`);
};
