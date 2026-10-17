// Pocket-Canvas — lets the app use the sync folder that a sync app (for example Syncthing) fills.
// Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com>
//
// Since Android 11, an app can only read files another app wrote if the person turns on
// "Allow access to manage all files" for it. This plugin checks that and opens the settings page.
package com.projecttechme.pocketcanvas;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AllFilesAccess")
public class AllFilesAccessPlugin extends Plugin {

    private boolean granted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return true; // Android 10 and older: the Filesystem plugin asks for storage permission itself
    }

    private JSObject result() {
        JSObject r = new JSObject();
        r.put("granted", granted());
        r.put("needsSettings", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R);
        r.put("storageRoot", Environment.getExternalStorageDirectory().getAbsolutePath());
        return r;
    }

    @PluginMethod
    public void check(PluginCall call) {
        call.resolve(result());
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                // some devices don't have the per-app page; open the list instead
                Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
        }
        call.resolve(result());
    }
}
