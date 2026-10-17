// Pocket-Canvas for Android
// Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com>
package com.projecttechme.pocketcanvas;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AllFilesAccessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
