package com.transporte.gestion_viaje.repository;

import com.transporte.gestion_viaje.model.Cliente;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ClienteRepository extends JpaRepository<Cliente, Long> {
    // Aquí podrías agregar métodos de búsqueda personalizados en el futuro
}