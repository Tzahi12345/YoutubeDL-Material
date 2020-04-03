import { BrowserModule } from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import { NgModule, LOCALE_ID } from '@angular/core';
import { registerLocaleData, CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatNativeDateModule, MatRippleModule } from '@angular/material/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
  import {DragDropModule} from '@angular/cdk/drag-drop';
  import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { AppComponent } from './app.component';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { PostsService } from 'app/posts.services';
import { FileCardComponent } from './file-card/file-card.component';
import {RouterModule} from '@angular/router';
import { AppRoutingModule } from './app-routing.module';
import { MainComponent } from './main/main.component';
import { PlayerComponent } from './player/player.component';
import {VgCoreModule, VgControlsModule, VgOverlayPlayModule, VgBufferingModule} from 'ngx-videogular';
import { InputDialogComponent } from './input-dialog/input-dialog.component';
import { LazyLoadImageModule, IsVisibleProps } from 'ng-lazyload-image';
import { audioFilesMouseHovering, videoFilesMouseHovering, audioFilesOpened, videoFilesOpened } from './main/main.component';
import { CreatePlaylistComponent } from './create-playlist/create-playlist.component';
import { DownloadItemComponent } from './download-item/download-item.component';
import { SubscriptionsComponent } from './subscriptions/subscriptions.component';
import { SubscribeDialogComponent } from './dialogs/subscribe-dialog/subscribe-dialog.component';
import { SubscriptionComponent } from './subscription//subscription/subscription.component';
import { SubscriptionFileCardComponent } from './subscription/subscription-file-card/subscription-file-card.component';
import { SubscriptionInfoDialogComponent } from './dialogs/subscription-info-dialog/subscription-info-dialog.component';
import { SettingsComponent } from './settings/settings.component';
import { CheckOrSetPinDialogComponent } from './dialogs/check-or-set-pin-dialog/check-or-set-pin-dialog.component';

import es from '@angular/common/locales/es';
import { AboutDialogComponent } from './dialogs/about-dialog/about-dialog.component';
import { VideoInfoDialogComponent } from './dialogs/video-info-dialog/video-info-dialog.component';
import { ArgModifierDialogComponent, HighlightPipe } from './dialogs/arg-modifier-dialog/arg-modifier-dialog.component';
import { UpdaterComponent } from './updater/updater.component';
import { UpdateProgressDialogComponent } from './dialogs/update-progress-dialog/update-progress-dialog.component';
registerLocaleData(es, 'es');

export function isVisible({ event, element, scrollContainer, offset }: IsVisibleProps<any>) {
  return (element.id === 'video' ? videoFilesMouseHovering || videoFilesOpened : audioFilesMouseHovering || audioFilesOpened);
}

@NgModule({
  declarations: [
    AppComponent,
    FileCardComponent,
    MainComponent,
    PlayerComponent,
    InputDialogComponent,
    CreatePlaylistComponent,
    DownloadItemComponent,
    SubscriptionsComponent,
    SubscribeDialogComponent,
    SubscriptionComponent,
    SubscriptionFileCardComponent,
    SubscriptionInfoDialogComponent,
    SettingsComponent,
    CheckOrSetPinDialogComponent,
    AboutDialogComponent,
    VideoInfoDialogComponent,
    ArgModifierDialogComponent,
    HighlightPipe,
    UpdaterComponent,
    UpdateProgressDialogComponent
  ],
  imports: [
    CommonModule,
    BrowserModule,
    BrowserAnimationsModule,
    MatNativeDateModule,
    MatRadioModule,
    FormsModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    HttpClientModule,
    MatToolbarModule,
    MatCardModule,
    MatSnackBarModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSidenavModule,
    MatIconModule,
    MatListModule,
    MatGridListModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    MatRippleModule,
    MatMenuModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatMenuModule,
    MatAutocompleteModule,
    MatTooltipModule,
    DragDropModule,
    VgCoreModule,
    VgControlsModule,
    VgOverlayPlayModule,
    VgBufferingModule,
    LazyLoadImageModule.forRoot({ isVisible }),
    RouterModule,
    AppRoutingModule,
  ],
  entryComponents: [
    InputDialogComponent,
    CreatePlaylistComponent,
    SubscribeDialogComponent,
    SubscriptionInfoDialogComponent,
    SettingsComponent,
    CheckOrSetPinDialogComponent
  ],
  providers: [
    PostsService
  ],
  exports: [
    HighlightPipe
  ],
  bootstrap: [AppComponent]
})

export class AppModule { }
