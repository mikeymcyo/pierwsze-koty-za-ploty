package uk.co.sitebosspro.fieldtest;

import android.app.Activity;
import android.os.Bundle;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.browser.customtabs.CustomTabsIntent;

public class SiteBossActivity extends Activity {
    private static final String BASE = "https://pierwsze-koty-za-ploty-git-feature-claude-api-mikeymcyo.vercel.app";

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        int inset = Math.round(24 * getResources().getDisplayMetrics().density);
        layout.setPadding(inset, inset, inset, inset);
        layout.setBackgroundColor(0xff070b10);
        TextView title = new TextView(this);
        title.setText("SiteBoss Pro");
        title.setTextSize(32);
        title.setTextColor(0xfff6b800);
        layout.addView(title);
        for (String[] action : new String[][] {{"Site Capture", "/reports/new"}, {"Dashboard", "/dashboard"}, {"Reports", "/reports"}}) {
            Button button = new Button(this);
            button.setText(action[0]);
            button.setOnClickListener(view -> {
                try {
                    new CustomTabsIntent.Builder().build().launchUrl(this, Uri.parse(BASE + action[1]));
                } catch (ActivityNotFoundException unavailable) {
                    Toast.makeText(this, "Install a web browser to open SiteBoss.", Toast.LENGTH_LONG).show();
                }
            });
            layout.addView(button);
        }
        setContentView(layout);
    }
}
