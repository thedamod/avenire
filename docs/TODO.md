# Todo

- [ ] Add automatic sensitive-window masking for local screen sharing. Resolve
      protected window bounds from an authoritative platform capture/privacy adapter,
      mask their pixels before renderer/model delivery, and handle overlapping windows,
      private browser windows, display scaling, monitor changes, and capture-time races.
      Current optional **Share screen with Ava** captures are unmasked full-display
      snapshots; source-saving filters do not protect those images. Keep that explicit
      in Settings and the privacy policy until masking is implemented and validated.
