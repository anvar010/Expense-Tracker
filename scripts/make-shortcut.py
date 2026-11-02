#!/usr/bin/env python3
"""
Builds the iPhone shortcut "Spendly Apple Pay" as an unsigned .shortcut file.
Sign it with:  shortcuts sign --mode anyone --input <unsigned> --output "public/Spendly Apple Pay.shortcut"
(iOS only imports shortcuts that Apple has signed.)

One action, "Get Contents of URL": POST the shortcut input to the app's /api/wallet endpoint. The input is
three lines (amount, merchant, card) that the Transaction automation builds from Apple Wallet.
On import the shortcut asks for the private link shown on the Apple Pay page in the app.
"""
import plistlib, sys, uuid

DEFAULT_URL = "https://expense-tracker-5nz6.vercel.app/api/wallet?key="

action = {
    "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
    "WFWorkflowActionParameters": {
        "UUID": str(uuid.uuid4()).upper(),
        "WFURL": DEFAULT_URL,
        "WFHTTPMethod": "POST",
        "WFHTTPBodyType": "File",
        "WFRequestVariable": {
            "Value": {"Type": "ExtensionInput"},
            "WFSerializationType": "WFTextTokenAttachment",
        },
        "ShowHeaders": False,
    },
}

workflow = {
    "WFWorkflowActions": [action],
    "WFWorkflowClientVersion": "2900.0.1",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4282601983, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowImportQuestions": [{
        "Category": "Parameter",
        "ParameterKey": "WFURL",
        "ActionIndex": 0,
        "Text": "Paste your private link from the Apple Pay page in the app. It contains your key, so keep it to yourself.",
        "DefaultValue": DEFAULT_URL,
    }],
    "WFWorkflowInputContentItemClasses": ["WFStringContentItem", "WFGenericFileContentItem"],
    "WFWorkflowTypes": [],
    "WFWorkflowHasShortcutInputVariables": True,
}

out = sys.argv[1] if len(sys.argv) > 1 else "spendly-apple-pay-unsigned.shortcut"
with open(out, "wb") as f:
    plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
print("wrote", out)
