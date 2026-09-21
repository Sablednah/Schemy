package uk.co.sable.schemy;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.zip.GZIPInputStream;

@CapacitorPlugin(name = "SchemyFiles")
public class SchemyFilesPlugin extends Plugin {
    private static final int MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
    private String pendingUri;

    @PluginMethod
    public void pickFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFileResult");
    }

    @ActivityCallback
    private void pickFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            call.resolve(new JSObject());
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // Some document providers grant access only for the current activity.
        }
        if (!isSupported(displayName(uri))) {
            call.reject("Please choose a .schematic, .schem, .nbt, or .litematic file");
            return;
        }
        call.resolve(reference(uri));
    }

    @PluginMethod
    public void getLaunchFile(PluginCall call) {
        JSObject result = new JSObject();
        if (pendingUri != null) {
            result.put("uri", pendingUri);
            pendingUri = null;
        }
        call.resolve(result);
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String value = call.getString("uri");
        if (value == null) {
            call.reject("No structure file was provided");
            return;
        }
        Uri uri = Uri.parse(value);
        String name = displayName(uri);
        if (!isSupported(name)) {
            call.reject("Unsupported file type: " + name);
            return;
        }
        try (InputStream source = getContext().getContentResolver().openInputStream(uri)) {
            if (source == null) throw new IOException("The document provider returned no data");
            BufferedInputStream buffered = new BufferedInputStream(source);
            buffered.mark(2);
            int first = buffered.read();
            int second = buffered.read();
            buffered.reset();
            InputStream decoded = first == 0x1f && second == 0x8b ? new GZIPInputStream(buffered) : buffered;
            byte[] bytes = readLimited(decoded);
            JSObject result = new JSObject();
            result.put("name", name);
            result.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(result);
        } catch (IOException | SecurityException error) {
            call.reject("Could not read " + name + ": " + error.getMessage(), error);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        Uri uri = incomingUri(intent);
        if (uri == null) return;
        if (!isSupported(displayName(uri))) return;
        if (hasListeners("fileOpen")) notifyListeners("fileOpen", reference(uri));
        else pendingUri = uri.toString();
    }

    private Uri incomingUri(Intent intent) {
        if (intent == null) return null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) return intent.getData();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            return stream instanceof Uri ? (Uri) stream : null;
        }
        return null;
    }

    private JSObject reference(Uri uri) {
        JSObject result = new JSObject();
        result.put("uri", uri.toString());
        return result;
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) {
                    String name = cursor.getString(column);
                    if (name != null && !name.isBlank()) return name;
                }
            }
        } catch (RuntimeException ignored) {}
        String segment = uri.getLastPathSegment();
        return segment == null ? "structure.nbt" : segment;
    }

    private boolean isSupported(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".schematic") || lower.endsWith(".schem") || lower.endsWith(".nbt") || lower.endsWith(".litematic");
    }

    private byte[] readLimited(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[64 * 1024];
        int total = 0;
        for (int count; (count = input.read(buffer)) >= 0;) {
            total += count;
            if (total > MAX_DECOMPRESSED_BYTES) throw new IOException("Structure exceeds the 256 MB safety limit");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
}
