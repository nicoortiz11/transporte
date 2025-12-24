package com.transporte.gestion_viaje.repository;

import com.transporte.gestion_viaje.model.Viaje;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ViajeRepository extends JpaRepository<Viaje, Long> {
    // Acá Spring hace magia: ya tenés métodos como save(), findAll(), delete(), etc.
    // sin escribir una sola línea de código.
}