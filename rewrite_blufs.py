import os
import re

base_path = "/Users/daniel/Documents/AGY/agy_quantum21/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
dirs = ["Ideation_Crucible", "Ready_For_Backtesting", "Graduated_Strategies", "Archived_Strategies"]

bluf_map = {
  "Model_20_MLB_Reliever_Spin_Rate_Decay.md": "MLB: Fading relief pitchers on zero days rest who rely heavily on high-spin breaking balls.",
  "Model_28_NHL_Backup_Goalie_Rust.md": "NHL: Fading backup goaltenders making their first start in over 14 days due to ring rust.",
  "Model_14_MLB_Umpire_Variance.md": "MLB: Betting the Under when extreme pitch-framing catchers pair with wide-zone umpires.",
  "Model_24_Tennis_Serve_Clock_Clay.md": "Tennis: Fading heavily-built baseline grinders on clay when umpires strictly enforce the serve clock.",
  "Model_18_NFL_Scripted_Drive_Efficiency.md": "NFL: Fading offenses that over-rely on scripted opening drives and fail to adapt later in the game.",
  "Model_32_NHL_Penalty_Kill_Exhaustion.md": "NHL: Betting 2nd Period team totals against teams that took 3+ minor penalties in the 1st period.",
  "Model_23_NBA_Referee_Pace.md": "NBA: Betting the Over when two high-pace teams play under a referee crew with high foul-call rates.",
  "Model_27_NCAAB_Tournament_Fatigue.md": "NCAAB: Fading mid-major teams playing their 3rd game in 3 days against rested higher seeds.",
  "Model_30_NFL_Freezing_Kicker_Decay.md": "NFL: Fading long field goal attempts (>45 yards) in the 2nd half when temperatures drop below freezing.",
  "Model_41_NFL_Primetime_Underdog.md": "NFL: Backing the underdog when they have a rookie head coach facing a veteran head coach.",
  "Model_07_NHL_Empty_Net_Pulls.md": "NHL: Live-betting goals when a team trailing by 2 in the 3rd period has a coach prone to early goalie pulls.",
  "Model_40_MLB_Catcher_Day_After_Night.md": "MLB: Fading starting catchers forced to play a day game immediately following a night game.",
  "Model_39_NBA_Ref_Home_Court.md": "NBA: Backing home teams down 0-2 or 1-2 in playoffs to exploit 'series extender' referee bias.",
  "Model_19_NCAAF_Service_Academy_Short_Rest.md": "NCAAF: Fading defenses preparing for a Service Academy triple-option offense on short rest.",
  "Model_42_NCAAF_Thursday_Night_Rivalry.md": "NCAAF: Fading highly-ranked road favorites against unranked home underdogs on weeknights.",
  "Model_33_NCAAB_Blowout_Backdoor_Cover.md": "NCAAB: Backing the backdoor cover by fading heavily favored home teams leading by 20+ points at halftime.",
  "Model_35_EPL_Derby_Ref_Leniency.md": "Soccer: Betting the Under on booking points in violent Derby matches assigned to notoriously lenient referees.",
  "Model_37_ATP_Baseline_Rally_Fatigue.md": "Tennis: Fading aging, baseline-reliant players in extreme heat following a marathon opening set.",
  "Model_43_NFL_Green_Dot_Motion.md": "NFL: Fading defenses missing their 'Green Dot' play-caller against offenses with extreme pre-snap motion.",
  "Model_17_EPL_Var_Stoppage_Time_Surge.md": "Soccer: Betting Over on Team Corners/Shots during final 15 minutes of matches following lengthy VAR reviews.",
  "Model_31_NBA_Coach_Ejection_Surge.md": "NBA: Betting Over/ATS for a disadvantaged home team immediately following their Head Coach's ejection.",
  "Model_44_Soccer_10_Man_Possession.md": "Soccer: Backing elite possession-heavy teams to defend a 1-0 lead after receiving a first-half red card.",
  "Model_21_NHL_Goalie_Puck_Tracking.md": "NHL: Fading starting goalies on zero days rest facing opponents with high net-front traffic/screen shots.",
  "Model_26_Golf_Wind_Asymmetry.md": "Golf: Fading elite golfers drawn into the afternoon wave when severe coastal wind spikes are forecast.",
  "Model_45_NBA_Review_Momentum_Shift.md": "NBA: Fading teams on massive scoring runs immediately following a lengthy (>3 min) referee review stoppage.",
  "Model_25_EPL_European_Travel_Hangover.md": "Soccer: Fading offensive output of heavy favorites playing Sunday after a long European away trip.",
  "Model_38_NHL_Empty_Net_Desperation.md": "NHL: Betting Under on Empty Net Goals when the leading team is playing ultra-conservative due to playoff pressure.",
  "Model_16_UFC_Altitude_Grappling_Decay.md": "UFC: Fading heavy, muscle-bound fighters who rely on explosive grappling at extreme high altitudes.",
  "Model_22_NFL_TNF_West_To_East.md": "NFL: Fading West Coast teams traveling two+ time zones East for a short-week Thursday Night Football game.",
  "Model_15_NBA_B2B_Travel_3PT_Variance.md": "NBA: Fading 3PT shooting efficiency for teams playing the 2nd leg of a B2B with 2+ time zone travel.",
  "Model_36_NFL_Preseason_QB_Rotation.md": "NFL: Fading preseason teams rotating pure rookie QBs against veteran journeyman backups.",
  "Model_29_NBA_B2B_Rebound_Decay.md": "NBA: Betting Under on Total Rebounds for starting Centers on a B2B facing elite offensive-rebounding opponents.",
  "Model_34_MLB_Bullpen_Game_Altitude.md": "MLB: Betting the Over on team totals against pitching staffs executing a 'Bullpen Game' in high altitude.",
  "Model_71_NBA_Late_Scratch_Usage.md": "NBA: Betting the Under on secondary scorers' props after a superstar is ruled a late scratch.",
  "Model_51_ATP_Heat_Index_Serve_Decay.md": "Tennis: Fading 'servebot' hold percentages in the 2nd/3rd sets when playing in extreme heat/humidity.",
  "Model_70_UFC_Short_Notice_Weight_Cut.md": "UFC: Fading fighters accepting short-notice bouts requiring extreme (>15 lbs) acute weight cuts.",
  "Model_46_NHL_Goalie_Shutout_Hangover.md": "NHL: Fading a goalie's performance immediately following a 40+ save shutout in their previous game.",
  "Model_47_NCAAF_Air_Raid_Wind.md": "NCAAF: Fading pure pass-heavy 'Air-Raid' offenses when playing in extreme crosswind conditions.",
  "Model_48_NFL_Altitude_B2B_Road.md": "NFL: Fading teams playing their second consecutive road game at high altitude (e.g. Denver).",
  "Model_54_MLB_Cold_Weather_Velocity.md": "MLB: Fading elite high-velocity power pitchers when they pitch in freezing temperatures.",
  "Model_76_WNBA_Super_Team_Fatigue.md": "WNBA: Fading elite 'Super-Teams' playing the 2nd leg of a B2B involving brutal high-altitude travel.",
  "Model_74_F1_Post_Safety_Car_Tire_Fade.md": "F1: Fading drivers with poor tire warm-up chassis on the restart lap following a prolonged Safety Car.",
  "Model_67_Soccer_Post_International_Break_Injury.md": "Soccer: Fading elite clubs in their first match immediately following a FIFA International Break.",
  "Model_75_CBB_Rivalry_Hangover.md": "NCAAB: Fading teams playing a road trap game 48 hours after a massive emotional victory over an in-state rival.",
  "Model_72_EPL_Relegation_Motivation.md": "Soccer: Backing desperate teams fighting relegation against comfortable mid-table teams.",
  "Model_68_MLB_Bullpen_Blowup.md": "MLB: Betting Over/Run-Lines against teams whose top 3 relief pitchers have pitched 3 of the last 4 days.",
  "Model_55_NBA_All_Star_Lookahead.md": "NBA: Fading young, eliminated/non-playoff teams playing on the road right before a break or season end.",
  "Model_62_NBA_Altitude_B2B.md": "NBA: Fading teams playing the 2nd night of a B2B in high altitude after playing at sea level the night before.",
  "Model_57_PGA_East_Coast_Travel.md": "Golf: Fading West Coast-native golfers making their first start on the East Coast (Florida Swing).",
  "Model_52_UFC_Leg_Kick_Takedown_Decay.md": "UFC: Fading takedown props for explosive wrestlers after they absorb massive calf kicks.",
  "Model_64_F1_Monaco_Engine_Degradation.md": "F1: Fading teams utilizing older power units in the race immediately following the thermal stress of Monaco.",
  "Model_63_ATP_Grand_Slam_Hangover.md": "Tennis: Fading mid-tier players playing a minor ATP 250 tournament immediately after a deep Grand Slam run.",
  "Model_69_NFL_Lookahead_Sandwich.md": "NFL: Fading elite Super Bowl contenders playing a massive underdog sandwiched before a prime-time matchup.",
  "Model_59_UFC_Altitude_Cardio.md": "UFC: Betting 'Fight Goes to Decision' by fading muscle-bound explosive fighters at extreme high altitude.",
  "Model_58_NHL_West_Coast_Road_Trip.md": "NHL: Heavily fading Eastern Conference teams playing the final game of a grueling West Coast road trip.",
  "Model_56_EPL_Intl_Break_Jetlag.md": "Soccer: Fading player props for South American/African stars playing immediately after a Wednesday international match.",
  "Model_50_MLB_Umpire_Travel_Hangover.md": "MLB: Fading starting pitchers when the home plate umpire is operating on severe sleep deprivation.",
  "Model_53_NFL_Dome_Outdoor_Decay.md": "NFL: Fading warm-weather dome-reliant passing offenses forced to travel to freezing outdoor stadiums.",
  "Model_49_NBA_Late_Game_FT_Pressure.md": "NBA: Fading career free-throw percentage expectations for players in clutch, high-pressure late-game situations.",
  "Model_60_MLB_Catchers_Day_After_Night.md": "MLB: Fading starting catchers playing a day game immediately following a night game.",
  "Model_61_NFL_TNF_Road_Dog_Exhaustion.md": "NFL: Fading West Coast underdogs traveling cross-country for a short-week Thursday Night game.",
  "Model_73_Tennis_Challenger_Transition.md": "Tennis: Fading young prospects transitioning to an ATP main draw immediately after winning a Challenger title.",
  "Model_65_NHL_Post_West_Coast_Road_Trip.md": "NHL: Fading Eastern teams playing their first home game back immediately after a grueling West Coast trip.",
  "Model_66_PGA_Bermuda_to_Poa_Annua.md": "Golf: Fading elite Bermuda-grass putters transitioning to the West Coast swing's Poa Annua grass greens.",
  "Model_05_NBA_Altitude_Fatigue.md": "NBA: Fading opposing teams playing the 2nd night of a back-to-back with travel to a high-altitude arena.",
  "Model_01_Late_Game_Poisson.md": "Soccer: Exploiting Poisson distribution anomalies in late-game scoring probabilities when a heavy favorite is trailing.",
  "Model_06_NFL_Wind_Decay.md": "NFL: Live-betting unders based on unpriced micro-weather wind speed increases in the 2nd half of open-air games.",
  "Model_04_Umpire_Catcher_Synergy.md": "MLB: Quantifying the compounding under-priced effect of elite framing catchers paired with wide-zone umpires.",
  "Model_13_Tennis_Serve_Clock.md": "Tennis: Exploiting live momentum swings based on strict enforcement of the automated serve clock rule.",
  "Model_02_Meteorological_Edges.md": "General: Fading market lines that systematically under-price extreme wind or rain in open-stadium leagues.",
  "Model_03_Momentum_Reversion.md": "Tennis: Exploiting algorithmic overreactions to live momentum shifts (e.g. being broken after winning set 1)."
}

count = 0
for d in dirs:
    dir_path = os.path.join(base_path, d)
    if not os.path.exists(dir_path): continue
    for f in os.listdir(dir_path):
        if not f.endswith(".md"): continue
        if f in bluf_map:
            file_path = os.path.join(dir_path, f)
            with open(file_path, "r") as file:
                content = file.read()
            
            # Replace the Concept block
            def replacer(match):
                return "**Concept:**\n" + bluf_map[f] + "\n"
            
            new_content = re.sub(r'\*\*Concept:\*\*\n(.*?)(?=\n\*|\n\n|\n\*\*|\Z)', replacer, content, count=1, flags=re.DOTALL)
            
            if new_content != content:
                with open(file_path, "w") as file:
                    file.write(new_content)
                count += 1

print(f"Applied new BLUFs to {count} models.")
