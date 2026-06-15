#!/usr/bin/env python3
import os
import json
import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

private_sid = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
work_sid = "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY"

HIDDEN_TABS = {
    1835375017,  # DRIVE_RESET_LOG
    1657749758,  # DRIVE_SESSION_LOG
    67786861,    # GMAIL_RETRO_LOG
    1325920151   # DRIVE_RETRO_LOG
}

def verify_visual_properties(spreadsheet_id, label):
    print(f"\n=== VERIFYING VISUAL PROPERTIES: {label} ({spreadsheet_id}) ===")
    token_path = "auth/token.json"
    if not os.path.exists(token_path):
        print(f"ERROR: Credentials token not found at {token_path}")
        return False
        
    try:
        with open(token_path, 'r') as f:
            creds_data = json.load(f)
        creds = Credentials.from_authorized_user_info(creds_data)
        service = build('sheets', 'v4', credentials=creds)
        
        # We also want to fetch the actual values and formatting for the first row of each sheet.
        # So we request includeGridData=True, but only retrieve fields we care about to keep payload small.
        # Field mask limits what is returned.
        fields = "sheets(properties(sheetId,title,hidden,gridProperties),data(rowData(values(effectiveFormat(backgroundColor,textFormat(fontFamily,bold,foregroundColor))))))"
        
        metadata = service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields=fields
        ).execute()
        
        sheets = metadata.get('sheets', [])
        success = True
        
        for s in sheets:
            props = s.get('properties', {})
            gid = props.get('sheetId')
            title = props.get('title')
            hidden = props.get('hidden', False)
            grid_props = props.get('gridProperties', {})
            frozen_rows = grid_props.get('frozenRowCount', 0)
            hide_gridlines = grid_props.get('hideGridlines', False)
            
            print(f"\nTab: '{title}' (GID: {gid})")
            print(f"  Hidden: {hidden}")
            print(f"  Frozen rows: {frozen_rows}")
            print(f"  Hide gridlines (API flag): {hide_gridlines} (Gridlines visible: {not hide_gridlines})")
            
            # Check hidden logic
            if gid in HIDDEN_TABS:
                if not hidden:
                    print(f"  [FAIL] Tab '{title}' (GID {gid}) should be hidden but is visible!")
                    success = False
                else:
                    print(f"  [OK] Tab is hidden as required.")
                continue
                
            if hidden:
                # If it's not a required hidden tab, but is hidden, it's fine as long as all active ones are visible.
                print(f"  [INFO] Tab is hidden.")
                continue
                
            # If visible, check formatting criteria
            # Exempt custom layout sheets from generic visual checks
            custom_sheets = [
                "00 Index", 
                "10 Email Tracker", 
                "10 Drive Tracker", 
                "10 Tasks Overview", 
                "1 Output - Notes Pivot"
            ]
            if title in custom_sheets:
                print(f"  [INFO] Tab '{title}' has custom layout, skipping standard styling rules.")
                continue
                
            # Check frozen rows (should be 1 or 2)
            if frozen_rows < 1 or frozen_rows > 2:
                print(f"  [FAIL] Frozen rows must be 1 or 2, got {frozen_rows}!")
                success = False
            else:
                print(f"  [OK] Frozen rows check passed.")
                
            # Check gridlines (should be visible, so hide_gridlines should be False)
            if hide_gridlines:
                print(f"  [FAIL] Gridlines must be visible, but hideGridlines is True!")
                success = False
            else:
                print(f"  [OK] Gridlines are visible.")
                
            # Check header cell format for A1 if data exists
            data_list = s.get('data', [])
            if data_list:
                row_data = data_list[0].get('rowData', [])
                if row_data:
                    first_row_values = row_data[0].get('values', [])
                    if first_row_values:
                        a1_format = first_row_values[0].get('effectiveFormat', {})
                        bg = a1_format.get('backgroundColor', {})
                        r = bg.get('red', 1.0)
                        g = bg.get('green', 1.0)
                        b = bg.get('blue', 1.0)
                        
                        # Expected #1c4587 (User Defined Dark Blue)
                        # We allow some tolerance (e.g. ±0.05)
                        is_header_blue = abs(r - 0.110) < 0.05 and abs(g - 0.271) < 0.05 and abs(b - 0.529) < 0.05
                        
                        # Let's print the actual color hex/values
                        hex_color = "#{:02X}{:02X}{:02X}".format(int(r*255), int(g*255), int(b*255))
                        print(f"  Header A1 background color: {hex_color} (R:{r:.3f}, G:{g:.3f}, B:{b:.3f})")
                        
                        if is_header_blue:
                            print(f"  [OK] Header color matches user-defined header blue #1c4587 ({hex_color}).")
                        else:
                            print(f"  [FAIL] Header color {hex_color} does not match expected #1c4587!")
                            success = False
                                
                        text_format = a1_format.get('textFormat', {})
                        font = text_format.get('fontFamily', '')
                        bold = text_format.get('bold', False)
                        fg_color = text_format.get('foregroundColor', {})
                        fg_r = fg_color.get('red', 0.0)
                        fg_g = fg_color.get('green', 0.0)
                        fg_b = fg_color.get('blue', 0.0)
                        
                        is_white_text = fg_r > 0.9 and fg_g > 0.9 and fg_b > 0.9
                        
                        print(f"  Header A1 Font: {font}, Bold: {bold}, Text Color matches white: {is_white_text}")
                        if not bold:
                            print(f"  [WARNING] Header text should be bold.")
                        if not is_white_text:
                            print(f"  [FAIL] Header text color must be white, got R:{fg_r}, G:{fg_g}, B:{fg_b}!")
                            success = False
                        else:
                            print(f"  [OK] Header text styling is compliant.")
                    else:
                        print("  [INFO] No values in row 1.")
                else:
                    print("  [INFO] No row data found.")
            else:
                print("  [INFO] No data section found.")
                
        return success
    except Exception as e:
        print(f"ERROR executing visual verification: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    private_ok = verify_visual_properties(private_sid, "Private")
    work_ok = verify_visual_properties(work_sid, "Work")
    
    print("\n=== VISUAL VERIFICATION SUMMARY ===")
    if private_ok and work_ok:
        print("All visual checks PASSED successfully.")
        sys.exit(0)
    else:
        print("Some visual checks FAILED. Please review the output above.")
        sys.exit(1)

if __name__ == '__main__':
    main()
