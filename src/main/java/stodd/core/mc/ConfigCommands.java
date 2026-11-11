package stodd.core.mc;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import stodd.core.config.StoddConfig;
import stodd.core.config.Toml;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * /stodd config                        where the files are, how many settings differ from the defaults, any problems in the files
 * /stodd config get <setting>          its value, its default and what it does
 * /stodd config find <word>            settings whose name or explanation contains the word
 * /stodd config set <setting> <value>  (operators) change it and save the file; plain words count as text
 * /stodd config reset <setting>        (operators) back to the default
 * /stodd config reload                 (operators) read the files again and reload the scripts (/reload)
 */
final class ConfigCommands {
    private ConfigCommands() { }

    static final SuggestionProvider<CommandSourceStack> SETTINGS = (c, b) -> {
        String typed = b.getRemaining().toLowerCase(Locale.ROOT);
        int n = 0;
        for (String k : StoddConfig.get().settings().keySet()) {
            if (!k.toLowerCase(Locale.ROOT).startsWith(typed)) continue;
            // offer the next part of the name first (skyIslands.  before every skyIslands setting)
            int dot = k.indexOf('.', typed.length());
            String offer = dot >= 0 ? k.substring(0, dot + 1) : k;
            b.suggest(offer);
            if (++n > 200) break;
        }
        return b.buildFuture();
    };

    static void say(CommandSourceStack s, String text, ChatFormatting f) {
        s.sendSuccess(() -> Component.literal(text).withStyle(f), false);
    }

    static String when(String path) {
        if (path.startsWith("spawnIslands.")) return "Restart the game and use a new world for it to take effect.";
        if (path.startsWith("skyIslands.")) return "It applies to worlds created from now on (new chunks of this world would not match the old ones).";
        if (path.startsWith("city.") || path.startsWith("makeover.") || path.startsWith("islandThemes.")) return "Run /stodd config reload; the islands of chunks generated after that follow it.";
        return "Run /stodd config reload (or /reload) for it to take effect.";
    }

    static LiteralArgumentBuilder<CommandSourceStack> tree() {
        return Commands.literal("config")
            .executes(c -> {
                StoddConfig cfg = StoddConfig.refresh();
                int changed = 0;
                for (String k : cfg.settings().keySet()) if (cfg.isSet(k) && !Toml.format(cfg.value(k)).equals(Toml.format(cfg.setting(k).def))) changed++;
                say(c.getSource(), "[STODD] Settings: " + cfg.dir() + " (" + String.join(", ", cfg.files()) + ".toml) - " + cfg.settings().size() + " settings, "
                    + changed + " changed from the defaults.", ChatFormatting.GOLD);
                say(c.getSource(), "  /stodd config get|find|set|reset|reload, or Mods > STODD Core > Config.", ChatFormatting.GRAY);
                say(c.getSource(), "  Sky islands: " + Math.round(cfg.skyChance() * 100) + "% of the islands are lifted (skyIslands.rarity = " + Toml.format(cfg.value("skyIslands.rarity"))
                    + "); cities: city.rarity = " + Toml.format(cfg.value("city.rarity")) + "; dressed islands: makeover.rarity = " + Toml.format(cfg.value("makeover.rarity")) + ".", ChatFormatting.GRAY);
                List<String> notes = cfg.notes();
                for (int i = 0; i < Math.min(10, notes.size()); i++) say(c.getSource(), "  ! " + notes.get(i), ChatFormatting.YELLOW);
                if (notes.size() > 10) say(c.getSource(), "  ... " + (notes.size() - 10) + " more in the log", ChatFormatting.YELLOW);
                return 1;
            })
            .then(Commands.literal("get")
                .then(Commands.argument("setting", StringArgumentType.word()).suggests(SETTINGS)
                    .executes(c -> {
                        String k = StringArgumentType.getString(c, "setting");
                        StoddConfig cfg = StoddConfig.refresh();
                        StoddConfig.Setting st = cfg.setting(k);
                        if (st == null) { say(c.getSource(), "[STODD] There is no setting " + k + " (try /stodd config find " + k + ")", ChatFormatting.RED); return 0; }
                        say(c.getSource(), "[STODD] " + k + " = " + Toml.format(cfg.value(k)), ChatFormatting.GOLD);
                        say(c.getSource(), "  default " + Toml.format(st.def) + ", in config/stodd/" + st.file + ".toml", ChatFormatting.GRAY);
                        if (!st.help().isEmpty()) say(c.getSource(), "  " + st.help(), ChatFormatting.WHITE);
                        return 1;
                    })))
            .then(Commands.literal("find")
                .then(Commands.argument("word", StringArgumentType.greedyString())
                    .executes(c -> {
                        String w = StringArgumentType.getString(c, "word").toLowerCase(Locale.ROOT);
                        StoddConfig cfg = StoddConfig.get();
                        List<String> hits = new ArrayList<>();
                        for (StoddConfig.Setting st : cfg.settings().values())
                            if (st.path.toLowerCase(Locale.ROOT).contains(w) || st.help().toLowerCase(Locale.ROOT).contains(w)) hits.add(st.path);
                        say(c.getSource(), "[STODD] " + hits.size() + " setting(s) about \"" + w + "\"" + (hits.size() > 20 ? ", the first 20:" : ":"), ChatFormatting.GOLD);
                        for (int i = 0; i < Math.min(20, hits.size()); i++) say(c.getSource(), "  " + hits.get(i) + " = " + Toml.format(cfg.value(hits.get(i))), ChatFormatting.WHITE);
                        return hits.size();
                    })))
            .then(Commands.literal("set").requires(s -> s.hasPermission(2))
                .then(Commands.argument("setting", StringArgumentType.word()).suggests(SETTINGS)
                    .then(Commands.argument("value", StringArgumentType.greedyString())
                        .executes(c -> {
                            String k = StringArgumentType.getString(c, "setting");
                            try {
                                String msg = StoddConfig.set(k, StringArgumentType.getString(c, "value"));
                                say(c.getSource(), "[STODD] " + msg, ChatFormatting.GREEN);
                                say(c.getSource(), "  " + when(k), ChatFormatting.GRAY);
                                return 1;
                            } catch (IllegalArgumentException e) {
                                say(c.getSource(), "[STODD] " + e.getMessage(), ChatFormatting.RED);
                                return 0;
                            }
                        }))))
            .then(Commands.literal("reset").requires(s -> s.hasPermission(2))
                .then(Commands.argument("setting", StringArgumentType.word()).suggests(SETTINGS)
                    .executes(c -> {
                        String k = StringArgumentType.getString(c, "setting");
                        try {
                            say(c.getSource(), "[STODD] " + StoddConfig.reset(k), ChatFormatting.GREEN);
                            say(c.getSource(), "  " + when(k), ChatFormatting.GRAY);
                            return 1;
                        } catch (IllegalArgumentException e) {
                            say(c.getSource(), "[STODD] " + e.getMessage(), ChatFormatting.RED);
                            return 0;
                        }
                    })))
            .then(Commands.literal("reload").requires(s -> s.hasPermission(2))
                .executes(c -> {
                    StoddConfig cfg = StoddConfig.load(stodd.core.Installer.gameDir());
                    say(c.getSource(), "[STODD] Read " + cfg.dir() + " again" + (cfg.notes().isEmpty() ? "." : " (" + cfg.notes().size() + " problem(s), see /stodd config)") + " Reloading the scripts...", ChatFormatting.GOLD);
                    c.getSource().getServer().getCommands().performPrefixedCommand(c.getSource(), "reload");
                    return 1;
                }));
    }
}
